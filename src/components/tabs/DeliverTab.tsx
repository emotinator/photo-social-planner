import { useState, useEffect, useCallback } from 'preact/hooks'
import JSZip from 'jszip'
import {
  currentImages, editTitle, editCaption, editHashtags,
  assembledPost, selectedTemplateId, showToast, activeTab,
} from '../../store'
import type { DraftImage } from '../../types'

export function DeliverTab() {
  const images = currentImages.value
  const title = editTitle.value
  const caption = editCaption.value
  const hashtags = editHashtags.value
  const assembled = assembledPost.value
  const isTemplateMode = !!selectedTemplateId.value

  const postText = isTemplateMode ? assembled : caption
  const hashtagText = hashtags.length > 0 ? hashtags.map((h: string) => `#${h}`).join(' ') : ''
  const fullCaption = isTemplateMode
    ? assembled
    : (caption + (hashtagText ? '\n\n' + hashtagText : ''))

  const hasContent = postText || images.length > 0

  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const urls: Record<string, string> = {}
    for (const img of images) {
      urls[img.id] = URL.createObjectURL(img.thumbnail || img.blob)
    }
    setThumbUrls(urls)
    return () => Object.values(urls).forEach(URL.revokeObjectURL)
  }, [images])

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(label)
      showToast(`${label} copied!`, 'success')
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      showToast('Copy failed', 'error')
    }
  }, [])

  const downloadImage = useCallback((img: DraftImage) => {
    const url = URL.createObjectURL(img.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = img.filename
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const downloadAllZip = useCallback(async () => {
    if (images.length === 0) return
    setDownloading(true)
    try {
      const zip = new JSZip()
      for (const img of images) {
        zip.file(img.filename, img.blob)
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const datePart = new Date().toISOString().split('T')[0]
      const namePart = (title || 'post').replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30)
      a.download = `${namePart}-${datePart}.zip`
      a.click()
      URL.revokeObjectURL(url)
      showToast(`Downloaded ${images.length} images as zip`, 'success')
    } catch {
      showToast('Zip download failed', 'error')
    } finally {
      setDownloading(false)
    }
  }, [images, title])

  if (!hasContent) {
    return (
      <div class="section">
        <div class="empty-state" style={{ padding: '40px 20px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace" }}>
            Generate a draft first, then come here to deliver it.
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
    <>
      {/* ── Images ── */}
      <div class="section">
        <div class="section-label">Images ({images.length})</div>

        {images.length > 0 && (
          <>
            <button
              class="btn btn-accent btn-full"
              onClick={downloadAllZip}
              disabled={downloading}
              style={{ marginBottom: '12px' }}
            >
              {downloading ? (
                <><span class="spinner" /> Zipping...</>
              ) : (
                <>
                  <span class="material-symbols-outlined" style={{ fontSize: '16px' }}>folder_zip</span>
                  Download All ({images.length}) as Zip
                </>
              )}
            </button>

            <div class="deliver-image-list">
              {images.map((img: DraftImage) => (
                <div key={img.id} class="deliver-image-item">
                  <div class="deliver-image-thumb">
                    {thumbUrls[img.id] && <img src={thumbUrls[img.id]} alt={img.filename} />}
                  </div>
                  <div class="deliver-image-info">
                    <div class="deliver-image-name">{img.filename}</div>
                    <div class="deliver-image-dims">{img.width} x {img.height}</div>
                  </div>
                  <button
                    class="btn btn-ghost btn-sm"
                    onClick={() => downloadImage(img)}
                    title="Download"
                  >
                    <span class="material-symbols-outlined" style={{ fontSize: '14px' }}>download</span>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {images.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--text3)', fontStyle: 'italic', fontFamily: "'DM Mono', monospace" }}>
            No images attached
          </div>
        )}
      </div>

      {/* ── Caption ── */}
      {postText && (
        <div class="section">
          <div class="section-label">
            Caption
            <button
              class="deliver-copy-btn"
              onClick={() => copyToClipboard(fullCaption, 'Caption')}
            >
              {copiedField === 'Caption' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div class="deliver-text-preview">{postText}</div>
        </div>
      )}

      {/* ── Hashtags (classic mode only) ── */}
      {!isTemplateMode && hashtags.length > 0 && (
        <div class="section">
          <div class="section-label">
            Hashtags
            <button
              class="deliver-copy-btn"
              onClick={() => copyToClipboard(hashtagText, 'Hashtags')}
            >
              {copiedField === 'Hashtags' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div class="deliver-text-preview" style={{ color: 'var(--accent)' }}>
            {hashtagText}
          </div>
        </div>
      )}

      {/* ── Full Post Copy ── */}
      {postText && (
        <div class="section">
          <button
            class="btn btn-accent btn-full"
            onClick={() => copyToClipboard(fullCaption, 'Full post')}
          >
            <span class="material-symbols-outlined" style={{ fontSize: '16px' }}>content_copy</span>
            {copiedField === 'Full post' ? 'Copied!' : 'Copy Full Post'}
          </button>
        </div>
      )}

      {/* ── Workflow hint ── */}
      <div class="section">
        <div class="section-label">Workflow</div>
        <div class="deliver-steps">
          <div class="deliver-step">
            <span class="deliver-step-num">1</span>
            Download images (zip or individual)
          </div>
          <div class="deliver-step">
            <span class="deliver-step-num">2</span>
            Open Instagram / platform composer
          </div>
          <div class="deliver-step">
            <span class="deliver-step-num">3</span>
            Drag images from Downloads folder
          </div>
          <div class="deliver-step">
            <span class="deliver-step-num">4</span>
            Copy caption above and paste
          </div>
        </div>
      </div>
    </>
  )
}
