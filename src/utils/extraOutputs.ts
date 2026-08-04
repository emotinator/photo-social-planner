import type { ExtraOutputs } from '../types'
import { PLATFORMS } from '../types'

/** JSON-schema fragments for the optional extra outputs, used by schema-capable providers. */
export function extraOutputProperties(extras: ExtraOutputs | undefined, imageCount: number): Record<string, any> {
  if (!extras) return {}
  const props: Record<string, any> = {}

  if (extras.altText) {
    props.altText = {
      type: 'array',
      items: { type: 'string' },
      minItems: imageCount,
      maxItems: imageCount,
      description: `Instagram alt text, one entry per image in order (${imageCount} total). Literal description of what is visible, about 125 characters, no "Image of" prefix, no hashtags.`,
    }
  }

  if (extras.threadsPost) {
    props.threadsPost = {
      type: 'string',
      description: `A standalone Threads post about the same photograph, 300-${PLATFORMS.threads.captionMaxLength} characters, conversational, no hashtags or title.`,
    }
  }

  return props
}

/** Keys the extras occupy — used to keep them out of template placeholder fills. */
export const EXTRA_OUTPUT_KEYS = ['altText', 'threadsPost'] as const

/**
 * Coerce whatever the model returned into the shapes we expect.
 * Local models ignore schemas, so alt text can come back as a bare string,
 * a short array, or an over-long one — all normalized to exactly imageCount entries.
 */
export function normalizeExtras(
  input: any,
  extras: ExtraOutputs | undefined,
  imageCount: number
): { altText?: string[]; threadsPost?: string } {
  const out: { altText?: string[]; threadsPost?: string } = {}
  if (!input || typeof input !== 'object') return out

  if (extras?.altText) {
    const raw = input.altText
    let list: string[]
    if (Array.isArray(raw)) {
      list = raw.map((v) => (typeof v === 'string' ? v.trim() : ''))
    } else if (typeof raw === 'string' && raw.trim()) {
      list = [raw.trim()]
    } else {
      list = []
    }
    // Pad short / truncate long so the array always lines up with the carousel
    const sized = Array.from({ length: imageCount }, (_, i) => list[i] || '')
    if (sized.some((s) => s)) out.altText = sized
  }

  if (extras?.threadsPost) {
    const raw = input.threadsPost
    if (typeof raw === 'string' && raw.trim()) out.threadsPost = raw.trim()
  }

  return out
}
