import { useEffect, useState, useCallback } from 'preact/hooks'
import {
  savedDrafts, currentImages, currentNotes, currentPlatform, previewIndex,
  editTitle, editCaption, editHashtags, generationResult,
  activeTab, showToast, editingDraftId, scrollToPlanDraftId,
  selectedProvider, selectedModel,
  assembledPost, selectedTemplateId, snippetSelections,
  editAltText, editThreadsPost,
} from '../../store'
import { saveDraft, loadAllDrafts, deleteDraft } from '../../store/storage'
import { PLATFORMS } from '../../types'
import type { Draft, DraftImage, PlatformId } from '../../types'
import { PlatformGlyph } from '../shared/PlatformGlyph'
import { planDateSlots, earliestPlannedDate, threadsDate } from '../../utils/planDates'

const PLATFORM_ICONS: Record<PlatformId, string> = {
  instagram: 'photo_camera',
  threads: 'alternate_email',
  linkedin: 'work',
  facebook: 'public',
}

/** Derive a display title from workspace state */
function deriveTitle(): string {
  // Use explicit title if set
  if (editTitle.value.trim()) return editTitle.value.trim()
  // Fall back to first ~40 chars of caption/assembled post
  const text = assembledPost.value || editCaption.value
  if (text.trim()) {
    const firstLine = text.trim().split('\n')[0]
    if (firstLine.length <= 50) return firstLine
    return firstLine.substring(0, 47) + '...'
  }
  return 'Untitled Draft'
}

export function PlanTab() {
  const drafts = savedDrafts.value
  const scrollTarget = scrollToPlanDraftId.value  // read during render so this component re-renders when it changes
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const hasContent = editCaption.value || editTitle.value || assembledPost.value || currentImages.value.length > 0
  const isEditing = !!editingDraftId.value

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

  // Scroll a draft into view when requested from the grid preview, and briefly highlight it.
  // Use an instant scroll: it completes synchronously (the highlight re-render can't cancel it,
  // and smooth programmatic scrolling is unreliable across environments). The flash draws the eye.
  useEffect(() => {
    if (!scrollTarget) return
    const el = document.querySelector(`.plan-item[data-draft-id="${scrollTarget}"]`) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ block: 'center' })
      setHighlightId(scrollTarget)
    }
    scrollToPlanDraftId.value = null
  }, [scrollTarget])

  // Clear the highlight after the flash animation finishes
  useEffect(() => {
    if (!highlightId) return
    const t = setTimeout(() => setHighlightId(null), 1400)
    return () => clearTimeout(t)
  }, [highlightId])

  /** Build a draft object from the current workspace */
  const buildDraft = useCallback((id: string, existing?: Draft | null): Draft => {
    const now = new Date().toISOString()
    const isTemplateMode = !!selectedTemplateId.value
    return {
      id,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      status: existing?.status || 'draft',
      platform: currentPlatform.value,
      images: currentImages.value,
      title: deriveTitle(),
      caption: isTemplateMode ? '' : editCaption.value,
      hashtags: isTemplateMode ? [] : editHashtags.value,
      templateFields: {},
      notes: currentNotes.value,
      // Extra outputs — only persisted when something was actually generated
      altText: editAltText.value.some((t: string) => t) ? [...editAltText.value] : undefined,
      threadsPost: editThreadsPost.value || undefined,
      generatedWith: generationResult.value
        ? {
            provider: selectedProvider.value,
            model: selectedModel.value,
            timestamp: now,
          }
        : undefined,
      plannedDate: existing?.plannedDate,
      threadsPlannedDate: existing?.threadsPlannedDate,
      planOrder: existing?.planOrder,
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
  }, [drafts])

  /** Overwrite the existing draft */
  const handleOverwrite = useCallback(async () => {
    if (!editingDraftId.value) return
    const existing = drafts.find((d: Draft) => d.id === editingDraftId.value)
    const draft = buildDraft(editingDraftId.value, existing)
    await saveDraft(draft)
    savedDrafts.value = await loadAllDrafts()
    showToast('Draft updated!', 'success')
  }, [drafts, buildDraft])

  /** Save as a new draft (detach from the one being edited) */
  const handleSaveNew = useCallback(async () => {
    const images = currentImages.value
    if (images.length === 0 && !editCaption.value && !assembledPost.value) {
      showToast('Nothing to save', 'error')
      return
    }
    const draft = buildDraft(crypto.randomUUID(), null)
    await saveDraft(draft)
    savedDrafts.value = await loadAllDrafts()
    editingDraftId.value = draft.id
    showToast('Saved as new draft!', 'success')
  }, [drafts, buildDraft])

  const handleDelete = async (id: string) => {
    await deleteDraft(id)
    savedDrafts.value = await loadAllDrafts()
    if (editingDraftId.value === id) editingDraftId.value = null
    showToast('Draft deleted', 'info')
  }

  const handleLoad = (draft: Draft) => {
    currentImages.value = draft.images
    previewIndex.value = 0
    currentNotes.value = draft.notes
    currentPlatform.value = draft.platform
    editTitle.value = draft.title
    editCaption.value = draft.caption
    editHashtags.value = draft.hashtags
    editAltText.value = draft.altText || []
    editThreadsPost.value = draft.threadsPost || ''
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

  const handleDateChange = async (draft: Draft, field: 'plannedDate' | 'threadsPlannedDate', dateStr: string) => {
    const updated = { ...draft, [field]: dateStr || undefined, updatedAt: new Date().toISOString() }
    if (dateStr && draft.status === 'draft') {
      updated.status = 'planned'
    }
    await saveDraft(updated)
    savedDrafts.value = await loadAllDrafts()
  }

  // Sort by planned date, latest first; undated drafts sink to the bottom
  // (ordered by most recently updated among themselves). A draft with both an
  // Instagram and a Threads date sorts by the earlier of the two.
  const sorted = [...drafts].sort((a: Draft, b: Draft) => {
    const aDate = earliestPlannedDate(a)
    const bDate = earliestPlannedDate(b)
    if (aDate && bDate) return bDate.localeCompare(aDate)
    if (aDate) return -1
    if (bDate) return 1
    return b.updatedAt.localeCompare(a.updatedAt)
  })

  // Local calendar date — toISOString() is UTC, which rolls over to tomorrow in the evening
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  /** One planned-date row, marked with the glyph of the platform it publishes to */
  const renderDateRow = (draft: Draft, field: 'plannedDate' | 'threadsPlannedDate', platform: PlatformId) => {
    const value = field === 'threadsPlannedDate' ? threadsDate(draft) : draft[field]
    // An unpinned Threads date follows the main one. That row is on screen too and
    // already carries the overdue/today flag, so the follower is dimmed and stays quiet.
    const inherited = field === 'threadsPlannedDate' && !draft.threadsPlannedDate && !!value && planDateSlots(draft).caption
    const isOverdue = !inherited && !!value && value < today && draft.status !== 'posted'
    const isToday = !inherited && value === today
    const name = PLATFORMS[platform].name
    const hint = inherited
      ? `Threads post follows the planned date — pick a date to post it on a different day`
      : `Planned ${name} post date`
    return (
      <div class="plan-date-picker">
        {platform === 'instagram' || platform === 'threads' ? (
          <PlatformGlyph platform={platform} />
        ) : (
          <span class="material-symbols-outlined" style={{ fontSize: '13px', color: 'var(--text3)' }}>calendar_month</span>
        )}
        <input
          type="date"
          class={`plan-date-input ${isOverdue ? 'overdue' : ''} ${isToday ? 'today' : ''} ${inherited ? 'inherited' : ''}`}
          value={value || ''}
          onChange={(e) => handleDateChange(draft, field, (e.target as HTMLInputElement).value)}
          title={hint}
          aria-label={`Planned ${name} post date`}
        />
        {isOverdue && (
          <span class="plan-date-flag overdue">overdue</span>
        )}
        {isToday && (
          <span class="plan-date-flag today">today</span>
        )}
      </div>
    )
  }

  return (
    <>
      {/* ── Save controls ── */}
      {hasContent && (
        <div class="section">
          {isEditing ? (
            <>
              {/* Editing an existing draft — offer overwrite or save-new */}
              <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", marginBottom: '8px', textAlign: 'center' }}>
                Editing: {drafts.find((d: Draft) => d.id === editingDraftId.value)?.title || 'draft'}
              </div>
              <div class="btn-row" style={{ gap: '6px' }}>
                <button class="btn btn-accent" style={{ flex: 1 }} onClick={handleOverwrite}>
                  <span class="material-symbols-outlined" style={{ fontSize: '16px' }}>save</span>
                  Overwrite
                </button>
                <button class="btn btn-ghost" style={{ flex: 1 }} onClick={handleSaveNew}>
                  <span class="material-symbols-outlined" style={{ fontSize: '16px' }}>add_circle</span>
                  Save New
                </button>
              </div>
            </>
          ) : (
            <button class="btn btn-accent btn-full" onClick={handleSaveNew}>
              <span class="material-symbols-outlined" style={{ fontSize: '16px' }}>save</span>
              Save Draft
            </button>
          )}
        </div>
      )}

      {/* ── Draft list ── */}
      <div class="section">
        <div class="section-label">Saved Drafts ({drafts.length})</div>

        {sorted.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text3)', fontStyle: 'italic', fontFamily: "'DM Mono', monospace" }}>
            No drafts saved yet
          </div>
        ) : (
          <div class="plan-list">
            {sorted.map((draft) => {
              const slots = planDateSlots(draft)
              // With no caption the platform setting means nothing — the draft is a Threads post
              const badgePlatform: PlatformId = slots.caption ? draft.platform : 'threads'
              const platformConfig = PLATFORMS[badgePlatform]
              const icon = PLATFORM_ICONS[badgePlatform]
              const snippet = draft.assembledPost || draft.caption || draft.threadsPost
              const isActive = editingDraftId.value === draft.id

              return (
                <div
                  key={draft.id}
                  data-draft-id={draft.id}
                  class={`plan-item ${isActive ? 'plan-item-active' : ''} ${highlightId === draft.id ? 'plan-item-highlight' : ''}`}
                >
                  <div class="plan-item-header">
                    <div class="plan-item-title">
                      {draft.title || 'Untitled Draft'}
                    </div>
                    <div class="plan-item-badges">
                      <span class={`badge badge-platform badge-platform-${badgePlatform}`} title={platformConfig.name}>
                        <span class="material-symbols-outlined" style={{ fontSize: '11px' }}>{icon}</span>
                        {platformConfig.name}
                      </span>
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

                  {snippet && (
                    <div class="plan-item-caption">{snippet}</div>
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

                  <div class="plan-item-meta">
                    <div class="plan-date-rows">
                      {slots.caption && renderDateRow(draft, 'plannedDate', draft.platform)}
                      {slots.threads && renderDateRow(draft, 'threadsPlannedDate', 'threads')}
                    </div>
                    <div class="plan-item-date">
                      {new Date(draft.updatedAt).toLocaleDateString()}
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
