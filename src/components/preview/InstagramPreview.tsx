import { useEffect, useState } from 'preact/hooks'
import type { DraftImage } from '../../types'

interface Props {
  images: DraftImage[]
  caption: string
  hashtags: string[]
  username: string
  selectedIndex?: number
  onIndexChange?: (index: number) => void
}

export function InstagramPreview({ images, caption, hashtags, username, selectedIndex, onIndexChange }: Props) {
  const [imageUrls, setImageUrls] = useState<string[]>([])

  const currentIndex = selectedIndex ?? 0
  const setCurrentIndex = (i: number) => onIndexChange?.(i)

  useEffect(() => {
    const urls = images.map((img) => URL.createObjectURL(img.blob))
    setImageUrls(urls)
    return () => urls.forEach(URL.revokeObjectURL)
  }, [images])

  // Derive container aspect ratio from the first image
  const firstImg = images[0]
  const aspectRatio = firstImg ? firstImg.width / firstImg.height : 1
  // Instagram clamps between 4:5 (0.8) and 1.91:1
  const clamped = Math.max(4 / 5, Math.min(aspectRatio, 1.91))
  const containerHeight = Math.round(375 / clamped)

  const prev = () => setCurrentIndex(Math.max(0, currentIndex - 1))
  const next = () => setCurrentIndex(Math.min(images.length - 1, currentIndex + 1))

  const hashtagText = hashtags.length > 0 ? '\n\n' + hashtags.map((h) => `#${h}`).join(' ') : ''

  if (images.length === 0 && !caption) {
    return (
      <div class="ig-preview" style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '13px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace" }}>
          No content to preview
        </div>
      </div>
    )
  }

  return (
    <div class="ig-preview">
      {/* Header */}
      <div class="ig-header">
        <div class="ig-avatar" />
        <span class="ig-username">{username}</span>
      </div>

      {/* Image / Carousel */}
      {imageUrls.length > 0 && (
        <div class="ig-image-container" style={{ height: `${containerHeight}px` }}>
          <img src={imageUrls[currentIndex]} alt="" />

          {images.length > 1 && (
            <>
              {currentIndex > 0 && (
                <button class="ig-carousel-nav prev" onClick={prev}>&lsaquo;</button>
              )}
              {currentIndex < images.length - 1 && (
                <button class="ig-carousel-nav next" onClick={next}>&rsaquo;</button>
              )}
              <div class="ig-carousel-dots">
                {images.map((_, i) => (
                  <div
                    key={i}
                    class={`ig-carousel-dot ${i === currentIndex ? 'active' : ''}`}
                    onClick={() => setCurrentIndex(i)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div class="ig-actions">
        <button class="ig-action">
          <span class="material-symbols-outlined">favorite</span>
        </button>
        <button class="ig-action">
          <span class="material-symbols-outlined">chat_bubble</span>
        </button>
        <button class="ig-action">
          <span class="material-symbols-outlined">send</span>
        </button>
        <div style={{ flex: 1 }} />
        <button class="ig-action">
          <span class="material-symbols-outlined">bookmark</span>
        </button>
      </div>

      {/* Caption */}
      {(caption || hashtags.length > 0) && (
        <div class="ig-caption-area">
          <div class="ig-caption">
            <span class="ig-username-inline">{username}</span>
            {caption}
            {hashtags.length > 0 && (
              <span class="ig-hashtags">{hashtagText}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
