import { activeTab, currentImages, editCaption, editTitle, editHashtags, previewIndex, assembledPost, selectedTemplateId } from '../../store'
import { InstagramPreview } from '../preview/InstagramPreview'

export function Canvas() {
  const tab = activeTab.value
  const images = currentImages.value
  const isTemplateMode = !!selectedTemplateId.value
  const hasContent = isTemplateMode ? !!assembledPost.value : (editCaption.value || editTitle.value)

  // Show IG preview on generate (when content exists) and deliver tabs
  if ((tab === 'generate' || tab === 'deliver') && hasContent) {
    const caption = isTemplateMode ? assembledPost.value : editCaption.value
    const hashtags = isTemplateMode ? [] : editHashtags.value
    return (
      <div class="canvas-area">
        <InstagramPreview
          images={images}
          caption={caption}
          hashtags={hashtags}
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
