import { openDB, type IDBPDatabase } from 'idb'
import type { Draft, DraftImage } from '../types'

const DB_NAME = 'photo-social-planner'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('drafts')) {
          db.createObjectStore('drafts', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'id' })
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
