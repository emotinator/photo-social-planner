import { useEffect, useRef } from 'preact/hooks'
import { activeTab, currentImages, editCaption, editTitle, editHashtags, previewIndex, assembledPost, selectedTemplateId, savedDrafts } from '../../store'
import { InstagramPreview } from '../preview/InstagramPreview'
import { InstagramGridPreview } from '../preview/InstagramGridPreview'

export function Canvas() {
  const tab = activeTab.value
  const images = currentImages.value
  const isTemplateMode = !!selectedTemplateId.value
  const hasContent = isTemplateMode ? !!assembledPost.value : (editCaption.value || editTitle.value)

  const canvasRef = useRef<HTMLDivElement>(null)

  // Reset the canvas scroll to the top whenever the tab changes.
  useEffect(() => {
    if (canvasRef.current) canvasRef.current.scrollTop = 0
  }, [tab])

  let content

  // Show IG grid preview on the Plan tab
  if (tab === 'plan') {
    content = <InstagramGridPreview drafts={savedDrafts.value} />
  } else if ((tab === 'generate' || tab === 'deliver') && hasContent) {
    // Show IG preview on generate (when content exists) and deliver tabs
    const caption = isTemplateMode ? assembledPost.value : editCaption.value
    const hashtags = isTemplateMode ? [] : editHashtags.value
    content = (
      <InstagramPreview
        images={images}
        caption={caption}
        hashtags={hashtags}
        username="photographer"
        selectedIndex={previewIndex.value}
        onIndexChange={(i) => { previewIndex.value = i }}
      />
    )
  } else if (images.length > 0) {
    const idx = Math.min(previewIndex.value, images.length - 1)
    const url = URL.createObjectURL(images[idx].blob)
    content = (
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
    )
  } else {
    content = (
      <div class="empty-state">
        <div class="empty-icon">
          <span class="material-symbols-outlined" style={{ fontSize: '56px' }}>photo_camera</span>
        </div>
        <h2>Photo Social Planner</h2>
        <p>Drop images to get started</p>
      </div>
    )
  }

  return (
    <div ref={canvasRef} class="canvas-area">
      {content}
    </div>
  )
}
