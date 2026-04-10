import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { createThumbnail } from '../../store/storage'
import { currentImages, showToast } from '../../store'
import type { DraftImage } from '../../types'

interface CropEditorProps {
  image: DraftImage
  onClose: () => void
}

interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'move' | null

const ASPECT_RATIOS: { label: string; ratio: number | null }[] = [
  { label: 'Free', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:16', ratio: 9 / 16 },
]

const HANDLE_SIZE = 10
const MIN_CROP = 20

export function CropEditor({ image, onClose }: CropEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 })
  const [aspectRatio, setAspectRatio] = useState<number | null>(null)
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ handle: Handle; startX: number; startY: number; startCrop: CropRect } | null>(null)

  // Load image
  useEffect(() => {
    const url = URL.createObjectURL(image.blob)
    const img = new Image()
    img.onload = () => {
      setImgEl(img)
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [image.blob])

  // Calculate layout and initial crop when image loads or container resizes
  useEffect(() => {
    if (!imgEl || !containerRef.current) return

    const container = containerRef.current
    const maxW = container.clientWidth - 40
    const maxH = container.clientHeight - 40
    const s = Math.min(maxW / imgEl.naturalWidth, maxH / imgEl.naturalHeight, 1)
    setScale(s)

    const dispW = imgEl.naturalWidth * s
    const dispH = imgEl.naturalHeight * s
    setOffset({
      x: (container.clientWidth - dispW) / 2,
      y: (container.clientHeight - dispH) / 2,
    })

    // Initial crop = full image
    setCrop({ x: 0, y: 0, w: dispW, h: dispH })
  }, [imgEl])

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgEl || !containerRef.current) return

    const container = containerRef.current
    canvas.width = container.clientWidth
    canvas.height = container.clientHeight
    const ctx = canvas.getContext('2d')!

    const dispW = imgEl.naturalWidth * scale
    const dispH = imgEl.naturalHeight * scale

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw image
    ctx.drawImage(imgEl, offset.x, offset.y, dispW, dispH)

    // Darken outside crop
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
    // Top
    ctx.fillRect(offset.x, offset.y, dispW, crop.y)
    // Bottom
    ctx.fillRect(offset.x, offset.y + crop.y + crop.h, dispW, dispH - crop.y - crop.h)
    // Left
    ctx.fillRect(offset.x, offset.y + crop.y, crop.x, crop.h)
    // Right
    ctx.fillRect(offset.x + crop.x + crop.w, offset.y + crop.y, dispW - crop.x - crop.w, crop.h)

    // Crop border
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.strokeRect(offset.x + crop.x, offset.y + crop.y, crop.w, crop.h)

    // Rule of thirds grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
    ctx.lineWidth = 0.5
    for (let i = 1; i <= 2; i++) {
      const gx = offset.x + crop.x + (crop.w * i) / 3
      ctx.beginPath()
      ctx.moveTo(gx, offset.y + crop.y)
      ctx.lineTo(gx, offset.y + crop.y + crop.h)
      ctx.stroke()

      const gy = offset.y + crop.y + (crop.h * i) / 3
      ctx.beginPath()
      ctx.moveTo(offset.x + crop.x, gy)
      ctx.lineTo(offset.x + crop.x + crop.w, gy)
      ctx.stroke()
    }

    // Corner handles
    ctx.fillStyle = '#fff'
    const hs = HANDLE_SIZE
    const corners = [
      [crop.x, crop.y],
      [crop.x + crop.w, crop.y],
      [crop.x, crop.y + crop.h],
      [crop.x + crop.w, crop.y + crop.h],
    ]
    for (const [cx, cy] of corners) {
      ctx.fillRect(offset.x + cx - hs / 2, offset.y + cy - hs / 2, hs, hs)
    }

    // Edge midpoint handles
    const edges = [
      [crop.x + crop.w / 2, crop.y],
      [crop.x + crop.w / 2, crop.y + crop.h],
      [crop.x, crop.y + crop.h / 2],
      [crop.x + crop.w, crop.y + crop.h / 2],
    ]
    for (const [ex, ey] of edges) {
      ctx.fillRect(offset.x + ex - hs / 2, offset.y + ey - hs / 2, hs, hs)
    }
  }, [imgEl, crop, scale, offset])

  const getHandle = useCallback(
    (mx: number, my: number): Handle => {
      const cx = mx - offset.x
      const cy = my - offset.y
      const hs = HANDLE_SIZE + 4 // hit area padding

      // Corner checks
      if (Math.abs(cx - crop.x) < hs && Math.abs(cy - crop.y) < hs) return 'nw'
      if (Math.abs(cx - (crop.x + crop.w)) < hs && Math.abs(cy - crop.y) < hs) return 'ne'
      if (Math.abs(cx - crop.x) < hs && Math.abs(cy - (crop.y + crop.h)) < hs) return 'sw'
      if (Math.abs(cx - (crop.x + crop.w)) < hs && Math.abs(cy - (crop.y + crop.h)) < hs) return 'se'

      // Edge checks
      if (Math.abs(cy - crop.y) < hs && cx > crop.x && cx < crop.x + crop.w) return 'n'
      if (Math.abs(cy - (crop.y + crop.h)) < hs && cx > crop.x && cx < crop.x + crop.w) return 's'
      if (Math.abs(cx - crop.x) < hs && cy > crop.y && cy < crop.y + crop.h) return 'w'
      if (Math.abs(cx - (crop.x + crop.w)) < hs && cy > crop.y && cy < crop.y + crop.h) return 'e'

      // Inside = move
      if (cx >= crop.x && cx <= crop.x + crop.w && cy >= crop.y && cy <= crop.y + crop.h) return 'move'

      return null
    },
    [crop, offset]
  )

  const getCursor = useCallback(
    (handle: Handle): string => {
      switch (handle) {
        case 'nw':
        case 'se':
          return 'nwse-resize'
        case 'ne':
        case 'sw':
          return 'nesw-resize'
        case 'n':
        case 's':
          return 'ns-resize'
        case 'e':
        case 'w':
          return 'ew-resize'
        case 'move':
          return 'move'
        default:
          return 'default'
      }
    },
    []
  )

  const clampCrop = useCallback(
    (c: CropRect): CropRect => {
      if (!imgEl) return c
      const dispW = imgEl.naturalWidth * scale
      const dispH = imgEl.naturalHeight * scale
      const x = Math.max(0, Math.min(c.x, dispW - MIN_CROP))
      const y = Math.max(0, Math.min(c.y, dispH - MIN_CROP))
      const w = Math.max(MIN_CROP, Math.min(c.w, dispW - x))
      const h = Math.max(MIN_CROP, Math.min(c.h, dispH - y))
      return { x, y, w, h }
    },
    [imgEl, scale]
  )

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const handle = getHandle(mx, my)
      if (!handle) return

      canvas.setPointerCapture(e.pointerId)
      dragRef.current = { handle, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } }
    },
    [crop, getHandle]
  )

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const canvas = canvasRef.current
      if (!canvas || !imgEl) return

      // Update cursor
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      if (!dragRef.current) {
        canvas.style.cursor = getCursor(getHandle(mx, my))
        return
      }

      const { handle, startX, startY, startCrop } = dragRef.current
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      const dispW = imgEl.naturalWidth * scale
      const dispH = imgEl.naturalHeight * scale

      let next = { ...startCrop }

      if (handle === 'move') {
        next.x = startCrop.x + dx
        next.y = startCrop.y + dy
        // Clamp position
        next.x = Math.max(0, Math.min(next.x, dispW - next.w))
        next.y = Math.max(0, Math.min(next.y, dispH - next.h))
        setCrop(next)
        return
      }

      // Resize handles
      if (handle?.includes('w')) {
        next.x = startCrop.x + dx
        next.w = startCrop.w - dx
      }
      if (handle?.includes('e')) {
        next.w = startCrop.w + dx
      }
      if (handle?.includes('n')) {
        next.y = startCrop.y + dy
        next.h = startCrop.h - dy
      }
      if (handle?.includes('s')) {
        next.h = startCrop.h + dy
      }

      // Enforce aspect ratio
      if (aspectRatio !== null) {
        if (handle === 'n' || handle === 's') {
          next.w = next.h * aspectRatio
        } else {
          next.h = next.w / aspectRatio
        }
        // Adjust position for top/left handles
        if (handle?.includes('n')) {
          next.y = startCrop.y + startCrop.h - next.h
        }
        if (handle?.includes('w')) {
          next.x = startCrop.x + startCrop.w - next.w
        }
      }

      setCrop(clampCrop(next))
    },
    [imgEl, scale, aspectRatio, getHandle, getCursor, clampCrop]
  )

  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  // Apply aspect ratio to current crop
  const applyAspectRatio = useCallback(
    (ratio: number | null) => {
      setAspectRatio(ratio)
      if (ratio === null || !imgEl) return

      const dispW = imgEl.naturalWidth * scale
      const dispH = imgEl.naturalHeight * scale

      // Fit the new ratio within the current crop center
      let newW = crop.w
      let newH = crop.w / ratio
      if (newH > crop.h) {
        newH = crop.h
        newW = crop.h * ratio
      }

      // Clamp to image bounds
      newW = Math.min(newW, dispW)
      newH = Math.min(newH, dispH)

      const cx = crop.x + crop.w / 2
      const cy = crop.y + crop.h / 2
      let nx = cx - newW / 2
      let ny = cy - newH / 2
      nx = Math.max(0, Math.min(nx, dispW - newW))
      ny = Math.max(0, Math.min(ny, dispH - newH))

      setCrop({ x: nx, y: ny, w: newW, h: newH })
    },
    [crop, imgEl, scale]
  )

  const applyCrop = useCallback(async () => {
    if (!imgEl) return

    // Convert display coords back to image coords
    const sx = crop.x / scale
    const sy = crop.y / scale
    const sw = crop.w / scale
    const sh = crop.h / scale

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(sw)
    canvas.height = Math.round(sh)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

    const blob: Blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b!), image.mimeType === 'image/png' ? 'image/png' : 'image/jpeg', 0.92)
    })

    const thumbnail = await createThumbnail(blob)

    const updated: DraftImage = {
      ...image,
      blob,
      thumbnail,
      width: canvas.width,
      height: canvas.height,
    }

    currentImages.value = currentImages.value.map((img: DraftImage) =>
      img.id === image.id ? updated : img
    )

    showToast('Image cropped', 'success')
    onClose()
  }, [imgEl, crop, scale, image, onClose])

  // Keyboard: Escape to close, Enter to apply
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter') applyCrop()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, applyCrop])

  const cropW = imgEl ? Math.round(crop.w / scale) : 0
  const cropH = imgEl ? Math.round(crop.h / scale) : 0

  return (
    <div class="crop-overlay">
      <div class="crop-toolbar">
        <div class="crop-ratios">
          {ASPECT_RATIOS.map(({ label, ratio }) => (
            <button
              key={label}
              class={`btn btn-sm ${ratio === aspectRatio || (ratio === null && aspectRatio === null) ? 'btn-accent' : 'btn-ghost'}`}
              onClick={() => applyAspectRatio(ratio)}
            >
              {label}
            </button>
          ))}
        </div>
        <div class="crop-dims">
          {cropW} x {cropH}
        </div>
        <div class="crop-actions">
          <button class="btn btn-sm btn-ghost" onClick={onClose}>Cancel</button>
          <button class="btn btn-sm btn-accent" onClick={applyCrop}>
            <span class="material-symbols-outlined" style={{ fontSize: '16px' }}>crop</span>
            Apply
          </button>
        </div>
      </div>
      <div class="crop-canvas-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>
    </div>
  )
}
