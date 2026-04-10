import { openDB, type IDBPDatabase } from 'idb'
import type { Draft, DraftImage, PostTemplate, SnippetSet, CaptionVoice } from '../types'

const DB_NAME = 'photo-social-planner'
const DB_VERSION = 3

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('drafts', { keyPath: 'id' })
          db.createObjectStore('images', { keyPath: 'id' })
        }
        if (oldVersion < 2) {
          db.createObjectStore('templates', { keyPath: 'id' })
          db.createObjectStore('snippetSets', { keyPath: 'id' })
        }
        if (oldVersion < 3) {
          db.createObjectStore('captionVoices', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

// Draft CRUD
export async function saveDraft(draft: Draft): Promise<void> {
  const db = await getDB()
  // Store images separately to keep draft objects lean
  const imageRefs = draft.images.map((img) => ({
    ...img,
    blob: undefined,
    thumbnail: undefined,
  }))

  // Save image blobs
  const tx = db.transaction('images', 'readwrite')
  for (const img of draft.images) {
    await tx.store.put({
      id: img.id,
      draftId: draft.id,
      blob: img.blob,
      thumbnail: img.thumbnail,
      filename: img.filename,
      mimeType: img.mimeType,
      width: img.width,
      height: img.height,
    })
  }
  await tx.done

  // Save draft with image refs (no blobs)
  await db.put('drafts', { ...draft, images: imageRefs })
}

export async function loadDraft(id: string): Promise<Draft | undefined> {
  const db = await getDB()
  const draft = await db.get('drafts', id)
  if (!draft) return undefined

  // Hydrate images with blobs
  const images: DraftImage[] = []
  for (const ref of draft.images) {
    const imgData = await db.get('images', ref.id)
    if (imgData) {
      images.push({
        id: imgData.id,
        blob: imgData.blob,
        thumbnail: imgData.thumbnail,
        filename: imgData.filename,
        mimeType: imgData.mimeType,
        width: imgData.width,
        height: imgData.height,
      })
    }
  }

  return { ...draft, images }
}

export async function loadAllDrafts(): Promise<Draft[]> {
  const db = await getDB()
  const drafts = await db.getAll('drafts')

  // Hydrate each draft with image blobs
  const hydrated: Draft[] = []
  for (const draft of drafts) {
    const images: DraftImage[] = []
    for (const ref of draft.images) {
      const imgData = await db.get('images', ref.id)
      if (imgData) {
        images.push({
          id: imgData.id,
          blob: imgData.blob,
          thumbnail: imgData.thumbnail,
          filename: imgData.filename,
          mimeType: imgData.mimeType,
          width: imgData.width,
          height: imgData.height,
        })
      }
    }
    hydrated.push({ ...draft, images })
  }

  return hydrated
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await getDB()

  // Delete associated images
  const draft = await db.get('drafts', id)
  if (draft) {
    const tx = db.transaction('images', 'readwrite')
    for (const ref of draft.images) {
      await tx.store.delete(ref.id)
    }
    await tx.done
  }

  await db.delete('drafts', id)
}

// Template CRUD
export async function saveTemplate(template: PostTemplate): Promise<void> {
  const db = await getDB()
  await db.put('templates', template)
}

export async function loadAllTemplates(): Promise<PostTemplate[]> {
  const db = await getDB()
  return db.getAll('templates')
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('templates', id)
}

// Snippet Set CRUD
export async function saveSnippetSet(set: SnippetSet): Promise<void> {
  const db = await getDB()
  await db.put('snippetSets', set)
}

export async function loadAllSnippetSets(): Promise<SnippetSet[]> {
  const db = await getDB()
  return db.getAll('snippetSets')
}

export async function deleteSnippetSet(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('snippetSets', id)
}

// Caption Voice CRUD
export async function saveCaptionVoice(voice: CaptionVoice): Promise<void> {
  const db = await getDB()
  await db.put('captionVoices', voice)
}

export async function loadAllCaptionVoices(): Promise<CaptionVoice[]> {
  const db = await getDB()
  return db.getAll('captionVoices')
}

export async function deleteCaptionVoice(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('captionVoices', id)
}

// Export/Import
export async function exportTemplateBundle(): Promise<string> {
  const templates = await loadAllTemplates()
  const snippetSets = await loadAllSnippetSets()
  const captionVoices = await loadAllCaptionVoices()

  // Include all persisted settings
  const settings: Record<string, unknown> = {}
  const genSettings = localStorage.getItem('psp-gen-settings')
  if (genSettings) {
    try { settings.generation = JSON.parse(genSettings) } catch {}
  }
  const providerConfigs = localStorage.getItem('psp-providers')
  if (providerConfigs) {
    try { settings.providers = JSON.parse(providerConfigs) } catch {}
  }
  settings.theme = localStorage.getItem('psp-theme') || 'dark'

  return JSON.stringify({
    version: 3,
    exportedAt: new Date().toISOString(),
    templates,
    snippetSets,
    captionVoices,
    settings,
  }, null, 2)
}

export async function importTemplateBundle(json: string): Promise<{ templates: number; snippetSets: number; voices: number; settingsRestored: boolean }> {
  const data = JSON.parse(json)
  if (!data.version || !Array.isArray(data.templates) || !Array.isArray(data.snippetSets)) {
    throw new Error('Invalid template bundle format')
  }

  let tCount = 0
  let sCount = 0
  let vCount = 0
  let settingsRestored = false

  for (const t of data.templates) {
    if (t.id && t.name && typeof t.body === 'string') {
      await saveTemplate(t as PostTemplate)
      tCount++
    }
  }

  for (const s of data.snippetSets) {
    if (s.id && s.name && Array.isArray(s.options)) {
      await saveSnippetSet(s as SnippetSet)
      sCount++
    }
  }

  if (Array.isArray(data.captionVoices)) {
    for (const v of data.captionVoices) {
      if (v.id && v.name && typeof v.description === 'string') {
        await saveCaptionVoice(v as CaptionVoice)
        vCount++
      }
    }
  }

  // Restore settings if present
  if (data.settings) {
    if (data.settings.generation) {
      localStorage.setItem('psp-gen-settings', JSON.stringify(data.settings.generation))
    }
    if (data.settings.providers) {
      localStorage.setItem('psp-providers', JSON.stringify(data.settings.providers))
    }
    if (data.settings.theme) {
      localStorage.setItem('psp-theme', data.settings.theme)
    }
    settingsRestored = true
  }

  return { templates: tCount, snippetSets: sCount, voices: vCount, settingsRestored }
}

// Image utilities
export async function createThumbnail(blob: Blob, maxSize = 200): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8)
  })
}

export async function resizeForLLM(blob: Blob, maxDim = 1024): Promise<{ base64: string; mimeType: string }> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(maxDim / bitmap.width, maxDim / bitmap.height, 1)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  return new Promise((resolve) => {
    canvas.toBlob(
      (b) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          const base64 = dataUrl.split(',')[1]
          resolve({ base64, mimeType: 'image/jpeg' })
        }
        reader.readAsDataURL(b!)
      },
      'image/jpeg',
      0.85
    )
  })
}
