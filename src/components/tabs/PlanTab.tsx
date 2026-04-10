import { useEffect, useState, useCallback, useRef } from 'preact/hooks'
import {
  savedDrafts, currentImages, currentNotes, currentPlatform,
  editTitle, editCaption, editHashtags, generationResult,
  activeTab, showToast, editingDraftId,
  selectedProvider, selectedModel,
  assembledPost, selectedTemplateId, snippetSelections,
} from '../../store'
import { saveDraft, loadAllDrafts, deleteDraft } from '../../store/storage'
import { PLATFORMS } from '../../types'
import type { Draft, DraftImage, PlatformId } from '../../types'

const PLATFORM_ICONS: Record<PlatformId, string> = {
  instagram: 'photo_camera',
  threads: 'alternate_email',
  linkedin: 'work',
  facebook: 'public',
}

export function PlanTab() {
  const drafts = savedDrafts.value
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const hasContent = editCaption.value || editTitle.value || assembledPost.value || currentImages.value.length > 0

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const dragItemRef = useRef<HTMLDivElement | null>(null)

  // Load drafts on mount
  useEffect(() => {
    loadAllDrafts().then((d) => {
      savedDrafts.value = d
    })
  }, [])

  // Generate thumbnail URLs
  useEffect(() => {
    const urls: Record<string, string> = {}
    for (const draft of drafts) {
      for (const img of draft.images) {
        if (img.thumbnail) {
          urls[img.id] = URL.createObjectURL(img.thumbnail)
        }
      }
    }
    setThumbUrls(urls)
    return () => Object.values(urls).forEach(URL.revokeObjectURL)
  }, [drafts])

  const handleSave = useCallback(async () => {
    const images = currentImages.value
    if (images.length === 0 && !editCaption.value && !assembledPost.value) {
      showToast('Nothing to save', 'error')
      return
    }

    const now = new Date().toISOString()
    const isTemplateMode = !!selectedTemplateId.value
    const existing = editingDraftId.value ? drafts.find((d: Draft) => d.id === editingDraftId.value) : null
    const draft: Draft = {
      id: editingDraftId.value || crypto.randomUUID(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      status: existing?.status || 'draft',
      platform: currentPlatform.value,
      images,
      title: editTitle.value,
      caption: isTemplateMode ? '' : editCaption.value,
      hashtags: isTemplateMode ? [] : editHashtags.value,
      templateFields: {},
      notes: currentNotes.value,
      generatedWith: generationResult.value
        ? {
            provider: selectedProvider.value,
            model: selectedModel.value,
            timestamp: now,
          }
        : undefined,
      plannedDate: existing?.plannedDate,
      planOrder: existing?.planOrder ?? sorted.length,
      assembledPost: isTemplateMode ? assembledPost.value : undefined,
      templateId: selectedTemplateId.value || undefined,
      templateResolution: isTemplateMode && selectedTemplateId.value
        ? {
            templateId: selectedTemplateId.value,
            snippetSelections: { ...snippetSelections.value },
            llmFills: generationResult.value?.llmFills || {},
          }
        : undefined,
    }

    await saveDraft(draft)
    savedDrafts.value = await loadAllDrafts()
    editingDraftId.value = null
    showToast('Draft saved!', 'success')
  }, [drafts])

  const handleDelete = async (id: string) => {
    await deleteDraft(id)
    savedDrafts.value = await loadAllDrafts()
    if (editingDraftId.value === id) editingDraftId.value = null
    showToast('Draft deleted', 'info')
  }

  const handleLoad = (draft: Draft) => {
    currentImages.value = draft.images
    currentNotes.value = draft.notes
    currentPlatform.value = draft.platform
    editTitle.value = draft.title
    editCaption.value = draft.caption
    editHashtags.value = draft.hashtags
    editingDraftId.value = draft.id

    // Restore template state
    if (draft.templateId && draft.templateResolution) {
      selectedTemplateId.value = draft.templateId
      snippetSelections.value = draft.templateResolution.snippetSelections || {}
      assembledPost.value = draft.assembledPost || ''
    } else {
      selectedTemplateId.value = null
      snippetSelections.value = {}
      assembledPost.value = ''
    }

    activeTab.value = 'generate'
    showToast('Draft loaded', 'info')
  }

  const toggleStatus = async (draft: Draft) => {
    const nextStatus = draft.status === 'draft' ? 'planned' : draft.status === 'planned' ? 'posted' : 'draft'
    const updated = { ...draft, status: nextStatus as Draft['status'], updatedAt: new Date().toISOString() }
    await saveDraft(updated)
    savedDrafts.value = await loadAllDrafts()
  }

  const handleDateChange = async (draft: Draft, dateStr: string) => {
    const updated = { ...draft, plannedDate: dateStr || undefined, updatedAt: new Date().toISOString() }
    // Auto-transition to planned when a date is set
    if (dateStr && draft.status === 'draft') {
      updated.status = 'planned'
    }
    await saveDraft(updated)
    savedDrafts.value = await loadAllDrafts()
  }

  // ── Drag reorder ──
  const handleDragStart = (e: DragEvent, idx: number) => {
    setDragIdx(idx)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(idx))
    }
    // Style the dragged item
    const el = (e.target as HTMLElement).closest('.plan-item') as HTMLDivElement
    if (el) {
      dragItemRef.current = el
      requestAnimationFrame(() => el.classList.add('dragging'))
    }
  }

  const handleDragOver = (e: DragEvent, idx: number) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    if (dragIdx !== null && idx !== dragIdx) {
      setOverIdx(idx)
    }
  }

  const handleDragEnd = () => {
    if (dragItemRef.current) dragItemRef.current.classList.remove('dragging')
    dragItemRef.current = null
    setDragIdx(null)
    setOverIdx(null)
  }

  const handleDrop = async (e: DragEvent, dropIdx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === dropIdx) {
      handleDragEnd()
      return
    }

    // Reorder the sorted array
    const reordered = [...sorted]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(dropIdx, 0, moved)

    // Update planOrder on all items and persist
    for (let i = 0; i < reordered.length; i++) {
      const updated = { ...reordered[i], planOrder: i }
      await saveDraft(updated)
    }
    savedDrafts.value = await loadAllDrafts()
    handleDragEnd()
    showToast('Order updated', 'info')
  }

  // Sort: by planOrder if available, then by status group, then by plannedDate, then updatedAt
  const sorted = [...drafts].sort((a: Draft, b: Draft) => {
    // If both have planOrder, use it
    if (a.planOrder !== undefined && b.planOrder !== undefined) {
      return a.planOrder - b.planOrder
    }
    const order: Record<string, number> = { planned: 0, draft: 1, posted: 2 }
    const diff = order[a.status] - order[b.status]
    if (diff !== 0) return diff
    // Within same status: sort by planned date (soonest first), then updatedAt
    if (a.plannedDate && b.plannedDate) return a.plannedDate.localeCompare(b.plannedDate)
    if (a.plannedDate) return -1
    if (b.plannedDate) return 1
    return b.updatedAt.localeCompare(a.updatedAt)
  })

  // Group by date for visual separation
  const today = new Date().toISOString().split('T')[0]

  return (
    <>
      {hasContent && (
        <div class="section">
          <button class="btn btn-accent btn-full" onClick={handleSave}>
            <span class="material-symbols-outlined" style={{ fontSize: '16px' }}>save</span>
            {editingDraftId.value ? 'Update Draft' : 'Save Draft'}
          </button>
        </div>
      )}

      <div class="section">
        <div class="section-label">Saved Drafts ({drafts.length})</div>

        {sorted.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text3)', fontStyle: 'italic', fontFamily: "'DM Mono', monospace" }}>
            No drafts saved yet
          </div>
        ) : (
          <div class="plan-list">
            {sorted.map((draft, idx) => {
              const platformConfig = PLATFORMS[draft.platform]
              const icon = PLATFORM_ICONS[draft.platform]
              const isOverdue = draft.plannedDate && draft.plannedDate < today && draft.status !== 'posted'
              const isToday = draft.plannedDate === today
              const isDragOver = overIdx === idx && dragIdx !== null && dragIdx !== idx

              return (
                <div
                  key={draft.id}
                  class={`plan-item ${isDragOver ? 'plan-item-drop-target' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, idx)}
                >
                  {/* Drag handle + header row */}
                  <div class="plan-item-header">
                    <span
                      class="material-symbols-outlined plan-drag-handle"
                      title="Drag to reorder"
                    >
                      drag_indicator
                    </span>
                    <div class="plan-item-title">
                      {draft.title || 'Untitled Draft'}
                    </div>
                    <div class="plan-item-badges">
                      {/* Platform tag */}
                      <span class={`badge badge-platform badge-platform-${draft.platform}`} title={platformConfig.name}>
                        <span class="material-symbols-outlined" style={{ fontSize: '11px' }}>{icon}</span>
                        {platformConfig.name}
                      </span>
                      {/* Status badge */}
                      <span
                        class={`badge badge-${draft.status}`}
                        onClick={() => toggleStatus(draft)}
                        style={{ cursor: 'pointer' }}
                        title="Click to change status"
                      >
                        {draft.status}
                      </span>
                    </div>
                  </div>

                  {(draft.assembledPost || draft.caption) && (
                    <div class="plan-item-caption">{draft.assembledPost || draft.caption}</div>
                  )}

                  {draft.images.length > 0 && (
                    <div class="plan-item-images">
                      {draft.images.slice(0, 4).map((img: DraftImage) => (
                        <img
                          key={img.id}
                          src={thumbUrls[img.id] || ''}
                          alt={img.filename}
                        />
                      ))}
                      {draft.images.length > 4 && (
                        <span style={{ fontSize: '11px', color: 'var(--text3)', alignSelf: 'center', fontFamily: "'DM Mono', monospace" }}>
                          +{draft.images.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Planned date row */}
                  <div class="plan-item-meta">
                    <div class="plan-date-picker">
                      <span class="material-symbols-outlined" style={{ fontSize: '13px', color: 'var(--text3)' }}>calendar_month</span>
                      <input
                        type="date"
                        class={`plan-date-input ${isOverdue ? 'overdue' : ''} ${isToday ? 'today' : ''}`}
                        value={draft.plannedDate || ''}
                        onChange={(e) => handleDateChange(draft, (e.target as HTMLInputElement).value)}
                        title="Planned post date"
                      />
                      {isOverdue && (
                        <span class="plan-date-flag overdue">overdue</span>
                      )}
                      {isToday && (
                        <span class="plan-date-flag today">today</span>
                      )}
                    </div>
                    <div class="plan-item-date">
                      Updated {new Date(draft.updatedAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div class="btn-row" style={{ marginTop: '8px' }}>
                    <button class="btn btn-ghost btn-sm" onClick={() => handleLoad(draft)}>
                      Edit
                    </button>
                    <button class="btn btn-danger btn-sm" onClick={() => handleDelete(draft.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
