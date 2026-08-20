import type { CaptionVoice } from '../types'

/**
 * JSON keys for the per-voice objects in a multi-voice request.
 *
 * The model has to reproduce these exactly, so they are slugified voice *names*
 * rather than voice ids: ids are UUIDs, and a key like "warm" also tells the model
 * which tone belongs in which slot. Names are free text, so a slug can collide or
 * come out empty — both fall back to a numbered key.
 */
export interface VoiceKey {
  key: string
  id: string
  name: string
  description: string
}

export function buildVoiceKeys(voices: CaptionVoice[]): VoiceKey[] {
  const used = new Set<string>()

  return voices.map((voice, i) => {
    const slug = voice.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24)
    const base = slug || `voice_${i + 1}`

    let key = base
    for (let n = 2; used.has(key); n++) key = `${base}_${n}`
    used.add(key)

    return { key, id: voice.id, name: voice.name, description: voice.description }
  })
}
