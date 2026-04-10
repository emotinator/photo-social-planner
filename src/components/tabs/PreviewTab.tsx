import { currentImages, editCaption, editHashtags, editTitle, activeTab } from '../../store'

export function PreviewTab() {
  const images = currentImages.value
  const caption = editCaption.value
  const title = editTitle.value

  if (!caption && images.length === 0) {
    return (
      <div class="section">
        <div class="empty-state" style={{ padding: '40px 20px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace" }}>
            Generate a draft first to see the preview
          </p>
          <button
            class="btn btn-ghost btn-sm"
            style={{ marginTop: '12px' }}
            onClick={() => (activeTab.value = 'generate')}
          >
            Go to Generate
          </button>
        </div>
      </div>
    )
  }

  return (
    <div class="section">
      <div class="section-label">Instagram Preview</div>
      <div style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", marginBottom: '12px' }}>
        The preview is shown in the canvas area to the right. Edit your caption and hashtags in the Generate tab.
      </div>

      {title && (
        <div style={{ marginBottom: '12px' }}>
          <div class="field-label">Title</div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)' }}>{title}</div>
        </div>
      )}

      <div style={{ marginBottom: '12px' }}>
        <div class="field-label">Caption Length</div>
        <div style={{ fontSize: '13px', color: 'var(--text2)', fontFamily: "'DM Mono', monospace" }}>
          {caption.length} / 2200 characters
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <div class="field-label">Hashtags</div>
        <div style={{ fontSize: '13px', color: 'var(--text2)', fontFamily: "'DM Mono', monospace" }}>
          {editHashtags.value.length} / 30
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <div class="field-label">Images</div>
        <div style={{ fontSize: '13px', color: 'var(--text2)', fontFamily: "'DM Mono', monospace" }}>
          {images.length} image{images.length !== 1 ? 's' : ''}
          {images.length > 1 && ' (carousel)'}
        </div>
      </div>
    </div>
  )
}
