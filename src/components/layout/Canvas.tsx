import { activeTab, currentImages, editCaption, editTitle, editHashtags, previewIndex } from '../../store'
import { InstagramPreview } from '../preview/InstagramPreview'

export function Canvas() {
  const tab = activeTab.value
  const images = currentImages.value
  const hasContent = editCaption.value || editTitle.value

  if (tab === 'preview' || (tab === 'generate' && hasContent)) {
    return (
      <div class="canvas-area">
        <InstagramPreview
          images={images}
          caption={editCaption.value}
          hashtags={editHashtags.value}
          username="photographer"
          selectedIndex={previewIndex.value}
          onIndexChange={(i) => { previewIndex.value = i }}
        />
      </div>
    )
  }

  if (images.length > 0) {
    const idx = Math.min(previewIndex.value, images.length - 1)
    const url = URL.createObjectURL(images[idx].blob)
    return (
      <div class="canvas-area">
        <img
          src={url}
          alt={images[idx].filename}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: '4px',
            boxShadow: '0 8px 48px rgba(0,0,0,0.4)',
          }}
        />
      </div>
    )
  }

  return (
    <div class="canvas-area">
      <div class="empty-state">
        <div class="empty-icon">
          <span class="material-symbols-outlined" style={{ fontSize: '56px' }}>photo_camera</span>
        </div>
        <h2>Photo Social Planner</h2>
        <p>Drop images to get started</p>
      </div>
    </div>
  )
}
