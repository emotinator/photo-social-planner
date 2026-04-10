import './styles/base.css'
import { useCallback, useRef, useState } from 'preact/hooks'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { Canvas } from './components/layout/Canvas'
import { ToastContainer } from './components/shared/Toast'
import { currentImages, isReorderDrag, showToast } from './store'
import { createThumbnail } from './store/storage'
import type { DraftImage } from './types'

export function App() {
  const [dragVisible, setDragVisible] = useState(false)
  const dragCounter = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    const newImages: DraftImage[] = []
    for (const file of imageFiles) {
      try {
        const bitmap = await createImageBitmap(file)
        const thumbnail = await createThumbnail(file)
        newImages.push({
          id: crypto.randomUUID(),
          blob: file,
          thumbnail,
          filename: file.name,
          mimeType: file.type,
          width: bitmap.width,
          height: bitmap.height,
        })
        bitmap.close()
      } catch {
        showToast(`Failed to load ${file.name}`, 'error')
      }
    }

    currentImages.value = [...currentImages.value, ...newImages]
    showToast(`Added ${newImages.length} image${newImages.length !== 1 ? 's' : ''}`, 'success')
  }, [])

  const onDragEnter = (e: DragEvent) => {
    if (isReorderDrag.value) return
    e.preventDefault()
    dragCounter.current++
    if (e.dataTransfer?.types.includes('Files')) setDragVisible(true)
  }

  const onDragLeave = (e: DragEvent) => {
    if (isReorderDrag.value) return
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setDragVisible(false)
    }
  }

  const onDragOver = (e: DragEvent) => {
    if (isReorderDrag.value) return
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'copy'
  }

  const onDrop = (e: DragEvent) => {
    if (isReorderDrag.value) return
    e.preventDefault()
    dragCounter.current = 0
    setDragVisible(false)
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length > 0) handleFiles(files)
  }

  const onBrowseClick = () => fileInputRef.current?.click()

  const onFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement
    const files = Array.from(input.files || [])
    if (files.length > 0) handleFiles(files)
    input.value = ''
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{ display: 'contents' }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onFileChange}
        style={{ display: 'none' }}
      />
      <Header onBrowseClick={onBrowseClick} />
      <div class="app-body">
        <Sidebar />
        <Canvas />
      </div>
      <ToastContainer />

      <div class={`global-drop-overlay ${dragVisible ? 'visible' : ''}`}>
        <div class="global-drop-inner">
          <div class="global-drop-icon">
            <span class="material-symbols-outlined" style={{ fontSize: '48px' }}>upload</span>
          </div>
          <div class="global-drop-label">Drop images here</div>
        </div>
      </div>
    </div>
  )
}
