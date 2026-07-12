import { useEffect, useState } from 'preact/hooks'
import { scrollToPlanDraftId } from '../../store'
import type { Draft } from '../../types'

interface Props {
  drafts: Draft[]
}

/**
 * Sort drafts for IG grid display:
 * Planned posts first, latest planned date first; undated drafts last.
 */
function sortForGrid(drafts: Draft[]): Draft[] {
  const planned = drafts
    .filter((d) => !!d.plannedDate)
    .sort((a, b) => b.plannedDate!.localeCompare(a.plannedDate!))
  const unplanned = drafts.filter((d) => !d.plannedDate)
  return [...planned, ...unplanned]
}

export function InstagramGridPreview({ drafts }: Props) {
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})

  const igDrafts = drafts.filter((d) => d.platform === 'instagram')
  const sorted = sortForGrid(igDrafts)

  // Build thumbnail URLs from first image of each draft
  useEffect(() => {
    const urls: Record<string, string> = {}
    for (const draft of igDrafts) {
      if (draft.images.length > 0) {
        const img = draft.images[0]
        urls[draft.id] = URL.createObjectURL(img.blob)
      }
    }
    setThumbUrls(urls)
    return () => Object.values(urls).forEach(URL.revokeObjectURL)
  }, [drafts])

  if (sorted.length === 0) {
    return (
      <div class="ig-grid-wrap">
        <div class="ig-grid-empty">
          <span class="material-symbols-outlined" style={{ fontSize: '40px', opacity: 0.15 }}>grid_on</span>
          <span>No Instagram posts planned</span>
        </div>
      </div>
    )
  }

  return (
    <div class="ig-grid-wrap">
      <div class="ig-grid">
        {sorted.map((draft) => {
          const url = thumbUrls[draft.id]
          return (
            <div
              key={draft.id}
              class="ig-grid-cell"
              onClick={() => { scrollToPlanDraftId.value = draft.id }}
              title={`Show "${draft.title || 'draft'}" in the list`}
            >
              {url ? (
                <img src={url} alt={draft.title} />
              ) : (
                <div class="ig-grid-placeholder">
                  <span style={{ fontSize: '11px' }}>{draft.title || 'No image'}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
