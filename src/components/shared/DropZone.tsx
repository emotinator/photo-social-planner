import { useState, useRef } from 'preact/hooks'

interface DropZoneProps {
  onFiles: (files: File[]) => void
  accept?: string
  multiple?: boolean
}

export function DropZone({ onFiles, accept = 'image/*', multiple = true }: DropZoneProps) {
  const [dragover, setDragover] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragover(false)
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'))
    if (files.length > 0) onFiles(files)
  }

  const handleChange = (e: Event) => {
    const input = e.target as HTMLInputElement
    const files = Array.from(input.files || [])
    if (files.length > 0) onFiles(files)
    input.value = ''
  }

  return (
    <div
      class={`drop-zone ${dragover ? 'dragover' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
      onDragLeave={() => setDragover(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <div class="drop-icon">
        <span class="material-symbols-outlined" style={{ fontSize: '30px' }}>upload</span>
      </div>
      <div class="drop-text">
        <strong>Click or drag & drop</strong>
        <br />JPEG / PNG / WebP
      </div>
    </div>
  )
}
