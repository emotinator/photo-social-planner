import { useEffect, useState, useCallback } from 'preact/hooks'
import {
  savedDrafts, currentImages, currentNotes, currentPlatform,
  editTitle, editCaption, editHashtags, generationResult,
  activeTab, showToast, editingDraftId,
  selectedProvider, selectedModel,
} from '../../store'
import { saveDraft, loadAllDrafts, deleteDraft } from '../../store/storage'
import type { Draft, DraftImage } from '../../types'

export function PlanTab() {
  const drafts = savedDrafts.value
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const hasContent = editCaption.value || editTitle.value || currentImages.value.length > 0

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
    if (images.length === 0 && !editCaption.value) {
      showToast('Nothing to save', 'error')
      return
    }

    const now = new Date().toISOString()
    const draft: Draft = {
      id: editingDraftId.value || crypto.randomUUID(),
      createdAt: editingDraftId.value ? (drafts.find((d: Draft) => d.id === editingDraftId.value)?.createdAt || now) : now,
      updatedAt: now,
      status: 'draft',
      platform: currentPlatform.value,
      images,
      title: editTitle.value,
      caption: editCaption.value,
      hashtags: editHashtags.value,
      templateFields: {},
      notes: currentNotes.value,
      generatedWith: generationResult.value
        ? {
            provider: selectedProvider.value,
            model: selectedModel.value,
            timestamp: now,
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
    activeTab.value = 'generate'
    showToast('Draft loaded', 'info')
  }

  const toggleStatus = async (draft: Draft) => {
    const nextStatus = draft.status === 'draft' ? 'planned' : draft.status === 'planned' ? 'posted' : 'draft'
    const updated = { ...draft, status: nextStatus as Draft['status'], updatedAt: new Date().toISOString() }
    await saveDraft(updated)
    savedDrafts.value = await loadAllDrafts()
  }

  // Sort: planned first, then draft, then posted; within each group by updatedAt desc
  const sorted = [...drafts].sort((a: Draft, b: Draft) => {
    const order: Record<string, number> = { planned: 0, draft: 1, posted: 2 }
    const diff = order[a.status] - order[b.status]
    if (diff !== 0) return diff
    return b.updatedAt.localeCompare(a.updatedAt)
  })

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
            {sorted.map((draft) => (
              <div key={draft.id} class="plan-item">
                <div class="plan-item-header">
                  <div class="plan-item-title">
                    {draft.title || 'Untitled Draft'}
                  </div>
                  <span
                    class={`badge badge-${draft.status}`}
                    onClick={() => toggleStatus(draft)}
                    style={{ cursor: 'pointer' }}
                    title="Click to change status"
                  >
                    {draft.status}
                  </span>
                </div>

                {draft.caption && (
                  <div class="plan-item-caption">{draft.caption}</div>
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

                <div class="plan-item-date">
                  {new Date(draft.updatedAt).toLocaleDateString()} &middot; {draft.platform}
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
            ))}
          </div>
        )}
      </div>
    </>
  )
}
