import { useEffect, useRef, useState } from 'preact/hooks'
import { currentImages, currentNotes, previewIndex, isReorderDrag } from '../../store'
import { CropEditor } from '../shared/CropEditor'
import type { DraftImage } from '../../types'

export function ImagesTab() {
  const images = currentImages.value
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const [croppingImage, setCroppingImage] = useState<DraftImage | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragSrcIndex = useRef<number | null>(null)

  // Generate object URLs for thumbnails
  useEffect(() => {
    const urls: Record<string, string> = {}
    for (const img of images) {
      urls[img.id] = URL.createObjectURL(img.thumbnail)
    }
    setThumbUrls(urls)
    return () => {
      Object.values(urls).forEach(URL.revokeObjectURL)
    }
  }, [images])

  const removeImage = (id: string) => {
    currentImages.value = currentImages.value.filter((img: DraftImage) => img.id !== id)
    if (previewIndex.value >= currentImages.value.length) {
      previewIndex.value = Math.max(0, currentImages.value.length - 1)
    }
  }

  // Drag-to-reorder handlers
  const onDragStart = (e: DragEvent, i: number) => {
    dragSrcIndex.current = i
    isReorderDrag.value = true
    e.dataTransfer!.effectAllowed = 'move'
    requestAnimationFrame(() => {
      const target = e.target as HTMLElement
      target.classList.add('dragging')
    })
  }

  const onDragEnd = (e: DragEvent) => {
    (e.target as HTMLElement).classList.remove('dragging')
    dragSrcIndex.current = null
    isReorderDrag.value = false
    setDragOverIndex(null)
  }

  const onDragOver = (e: DragEvent, i: number) => {
    // Only handle reorder drags (not external file drops)
    if (dragSrcIndex.current === null) return
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'move'
    if (dragOverIndex !== i) setDragOverIndex(i)
  }

  const onDragLeave = () => {
    setDragOverIndex(null)
  }

  const onDrop = (e: DragEvent, toIndex: number) => {
    e.preventDefault()
    const fromIndex = dragSrcIndex.current
    if (fromIndex === null || fromIndex === toIndex) {
      setDragOverIndex(null)
      return
    }
    const arr = [...images]
    const [item] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, item)
    currentImages.value = arr

    // Keep the preview pointing at the same image
    if (previewIndex.value === fromIndex) {
      previewIndex.value = toIndex
    } else if (fromIndex < previewIndex.value && toIndex >= previewIndex.value) {
      previewIndex.value -= 1
    } else if (fromIndex > previewIndex.value && toIndex <= previewIndex.value) {
      previewIndex.value += 1
    }

    dragSrcIndex.current = null
    setDragOverIndex(null)
  }

  return (
    <>
      <div class="section">
        <div class="section-label">Images</div>

        {images.length > 0 && (
          <div class="image-gallery">
            {images.map((img: DraftImage, i: number) => (
              <div
                key={img.id}
                class={`image-thumb${i === previewIndex.value ? ' selected' : ''}${dragOverIndex === i ? ' drag-over' : ''}`}
                title={img.filename}
                draggable
                onClick={() => { previewIndex.value = i }}
                onDragStart={(e) => onDragStart(e as DragEvent, i)}
                onDragEnd={(e) => onDragEnd(e as DragEvent)}
                onDragOver={(e) => onDragOver(e as DragEvent, i)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e as DragEvent, i)}
              >
                {thumbUrls[img.id] && <img src={thumbUrls[img.id]} alt={img.filename} draggable={false} />}
                <button
                  class="crop-btn"
                  onClick={(e) => { e.stopPropagation(); setCroppingImage(img) }}
                  title="Crop"
                >
                  <span class="material-symbols-outlined" style={{ fontSize: '14px' }}>crop</span>
                </button>
                <button
                  class="remove-btn"
                  onClick={(e) => { e.stopPropagation(); removeImage(img.id) }}
                  title="Remove"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        {images.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", padding: '8px 0' }}>
            Drag images anywhere, or paste with {navigator.userAgent.includes('Mac') ? 'Cmd' : 'Ctrl'}+V
          </div>
        )}
      </div>

      <div class="section">
        <div class="section-label">Notes</div>
        <textarea
          rows={6}
          placeholder="Add notes about your photo(s) for the AI to use... e.g., location, mood, gear, story behind the shot"
          value={currentNotes.value}
          onInput={(e) => (currentNotes.value = (e.target as HTMLTextAreaElement).value)}
        />
      </div>

      {images.length > 0 && (
        <div class="section">
          <div style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace" }}>
            {images.length} image{images.length !== 1 ? 's' : ''} loaded
            {images.length > 1 && ' \u2022 drag to reorder'}
          </div>
        </div>
      )}

      {croppingImage && (
        <CropEditor
          image={croppingImage}
          onClose={() => setCroppingImage(null)}
        />
      )}
    </>
  )
}
