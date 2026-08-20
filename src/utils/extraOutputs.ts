import type { ExtraOutputs } from '../types'
import { PLATFORMS, ALT_TEXT_MAX, ALT_TEXT_DESCRIPTION_TARGET } from '../types'

/**
 * Output-token ceiling for a generation request.
 *
 * A flat ceiling silently truncates large carousels: ten images of alt text alone
 * can outrun 2048 tokens, and a cut-off tool call comes back as a *partial* object
 * — the first few entries filled, the rest missing. So the ceiling is sized from
 * what was actually asked for.
 *
 * This is a ceiling, not a reservation: unused headroom costs nothing.
 */
const TOKENS_CAPTION = 1024   // title + caption + hashtags
const TOKENS_PER_ALT = 280    // ALT_TEXT_MAX chars ≈ 250 tokens, plus JSON escaping
const TOKENS_THREADS = 220
const TOKENS_MIN = 1024
const TOKENS_MAX = 16000      // far under any current vision model's output cap

export function estimateMaxTokens(
  wantCaption: boolean,
  extras: ExtraOutputs | undefined,
  imageCount: number
): number {
  let total = wantCaption ? TOKENS_CAPTION : 0
  if (extras?.altText) total += Math.max(1, imageCount) * TOKENS_PER_ALT
  if (extras?.threadsPost) total += TOKENS_THREADS
  return Math.min(TOKENS_MAX, Math.max(TOKENS_MIN, total))
}

/** JSON-schema fragments for the optional extra outputs, used by schema-capable providers. */
export function extraOutputProperties(
  extras: ExtraOutputs | undefined,
  imageCount: number,
  threadsBudget?: number
): Record<string, any> {
  if (!extras) return {}
  const props: Record<string, any> = {}

  if (extras.altText) {
    props.altText = {
      type: 'array',
      items: { type: 'string' },
      minItems: imageCount,
      maxItems: imageCount,
      description: `Instagram alt text, one entry per image in order (${imageCount} total). Opens with a literal description of what is visible, about ${ALT_TEXT_DESCRIPTION_TARGET} characters, optionally followed by further true, searchable detail. Hard maximum ${ALT_TEXT_MAX} characters. No "Image of" prefix, no hashtags.`,
    }
  }

  if (extras.threadsPost) {
    const max = threadsBudget ?? PLATFORMS.threads.captionMaxLength
    props.threadsPost = {
      type: 'string',
      description: `A standalone Threads post about the same photograph. STRICT maximum ${max} characters — a credits block is appended below it afterwards, so end on your last sentence and never include a credits line, a "Credits:" label, a placeholder like "[credits]", or trailing dots. Conversational, no hashtags, no title, no @mentions.`,
    }
  }

  return props
}

/** Keys the extras occupy — used to keep them out of template placeholder fills. */
export const EXTRA_OUTPUT_KEYS = ['altText', 'threadsPost'] as const

/**
 * The full JSON schema for a generation request — every key the model must return.
 *
 * Both providers need this same shape, and it has to be enforced rather than merely
 * described: told in prose to return "exactly 10 strings", models routinely return
 * five and stop cleanly. Constrained decoding against `minItems`/`maxItems` is what
 * actually makes the count hold.
 */
export function buildOutputSchema(req: {
  templateLLMFields?: { key: string }[]
  wantCaption?: boolean
  extraOutputs?: ExtraOutputs
  imageCount: number
  threadsBudget?: number
}): { type: 'object'; properties: Record<string, any>; required: string[] } {
  const extraProps = extraOutputProperties(req.extraOutputs, req.imageCount, req.threadsBudget)
  let captionProps: Record<string, any> = {}

  if (req.wantCaption !== false) {
    captionProps = req.templateLLMFields
      ? Object.fromEntries(
          req.templateLLMFields.map((f) => [
            f.key,
            { type: 'string', description: `Value for the "${f.key}" placeholder` },
          ])
        )
      : {
          title: { type: 'string', description: 'A compelling title for the post' },
          caption: { type: 'string', description: 'The full caption text for the social media post' },
          hashtags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Relevant hashtags without the # symbol',
          },
        }
  }

  const properties = { ...captionProps, ...extraProps }
  return { type: 'object', properties, required: Object.keys(properties) }
}

/**
 * Models routinely sign off a Threads post with a stand-in for the credits —
 * "[credits below]", a bare "Credits:", dot spacers, or an imitation of the real
 * block — even when told not to. The real block is appended afterwards, so any
 * such trailing lines are stripped here.
 */
const CREDITS_TRAILER_PATTERNS: RegExp[] = [
  /^[\s.·•—–-]*$/,                                       // blank, or dot/dash spacer lines
  /^[[({<].*[\])}>]$/,                                   // a whole-line placeholder: [credits], (credit block)
  /^(photo\s+)?credits?(\s+block)?\s*[:—–-]*\s*$/i,      // a bare "Credits:" label
  /^(credits?|@handles?|mentions?)\b.*\b(below|here|follow|to\s+be\s+added|go\s+here)\b.*$/i,
  /^(shot|photo(graph(ed)?)?|captured|produced|directed|creative\s+direction|in\s+frame|studio|agency|model|mua|makeup|hair|styl(ing|ed)|wardrobe|lighting|edit(ed|ing)?|retouch(ing|ed)?)\b[^\n]*[@[]/i,
]

export function stripCreditsTrailer(text: string): string {
  const lines = text.split('\n')
  let end = lines.length
  while (end > 0 && CREDITS_TRAILER_PATTERNS.some((re) => re.test(lines[end - 1].trim()))) {
    end--
  }
  const stripped = lines.slice(0, end).join('\n').trimEnd()
  // If it consumed everything, the heuristic misread real prose — keep the original
  return stripped || text.trim()
}

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
    if (typeof raw === 'string' && raw.trim()) out.threadsPost = stripCreditsTrailer(raw.trim())
  }

  return out
}
