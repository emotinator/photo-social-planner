import type { Draft } from '../types'

/**
 * Repetition-awareness context fed into the generation prompt so the LLM can
 * avoid making a *cluster* of planned posts feel same-y. This is intentionally
 * NOT a cumulative blocklist: the pool is only currently-`planned` posts, so as
 * posts move to `posted` they drop out and their words become available again.
 */
export interface RepetitionContext {
  /** Exact titles already used by planned posts — don't reuse or closely echo. */
  usedTitles: string[]
  /** Descriptive words appearing in 2+ planned posts — ease off, favor fresh ones. */
  overusedTerms: { word: string; count: number }[]
}

/** Only words shared by at least this many planned posts count as "repetitive". */
const REPEAT_THRESHOLD = 2
/** Keep the prompt compact — surface only the worst offenders. */
const MAX_TERMS = 10
/** Ignore short words; descriptive terms of interest (glow, silk, golden) are 4+. */
const MIN_WORD_LEN = 4

/**
 * Common function words plus a few photography-generic nouns we never want to
 * flag as "repetitive" — these are expected to recur and aren't the descriptive
 * flourishes the feature targets. Tunable.
 */
const STOPWORDS = new Set([
  'this', 'that', 'these', 'those', 'with', 'from', 'your', 'yours', 'have', 'they',
  'them', 'their', 'there', 'here', 'what', 'when', 'where', 'which', 'while', 'would',
  'could', 'should', 'about', 'into', 'over', 'under', 'were', 'been', 'being', 'also',
  'just', 'like', 'then', 'than', 'some', 'such', 'very', 'much', 'more', 'most',
  'only', 'even', 'because', 'other', 'another', 'every', 'both', 'each', 'many',
  'will', 'shall', 'upon', 'onto', 'through', 'during', 'after', 'before', 'between',
  'photo', 'photos', 'photograph', 'photography', 'image', 'images', 'picture', 'pictures',
  'shot', 'capture', 'captured', 'post', 'today',
])

/**
 * Light suffix-normalization so a family of words (silk/silky, glow/glowing/glows)
 * collapses to one stem and counts together. Deliberately conservative: never
 * reduces a word below MIN_WORD_LEN, so it groups obvious variants without
 * aggressively mangling unrelated words.
 */
function stem(word: string): string {
  for (const suffix of ['ing', 'ly', 'ed', 'es', 's', 'y']) {
    if (word.endsWith(suffix) && word.length - suffix.length >= MIN_WORD_LEN) {
      return word.slice(0, word.length - suffix.length)
    }
  }
  return word
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z']+/g) || [])
    .map((w) => w.replace(/'/g, ''))
    .filter((w) => w.length >= MIN_WORD_LEN && !STOPWORDS.has(w))
}

export function buildRepetitionContext(drafts: Draft[]): RepetitionContext {
  const planned = drafts.filter((d) => d.status === 'planned')

  const usedTitles: string[] = []
  const seenTitles = new Set<string>()

  // For each stem: how many distinct posts used it, and which surface forms.
  const postsForStem = new Map<string, Set<number>>()
  const surfaceCounts = new Map<string, Map<string, number>>()

  planned.forEach((draft, postIdx) => {
    const title = draft.title?.trim()
    if (title) {
      const key = title.toLowerCase()
      if (!seenTitles.has(key)) {
        seenTitles.add(key)
        usedTitles.push(title)
      }
    }

    const words = tokenize(`${draft.title || ''} ${draft.caption || ''}`)
    for (const word of words) {
      const s = stem(word)
      if (!postsForStem.has(s)) {
        postsForStem.set(s, new Set())
        surfaceCounts.set(s, new Map())
      }
      postsForStem.get(s)!.add(postIdx)
      const forms = surfaceCounts.get(s)!
      forms.set(word, (forms.get(word) || 0) + 1)
    }
  })

  const overusedTerms = [...postsForStem.entries()]
    .map(([s, posts]) => ({ word: pickSurfaceForm(surfaceCounts.get(s)!), count: posts.size }))
    .filter((t) => t.count >= REPEAT_THRESHOLD)
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, MAX_TERMS)

  return { usedTitles, overusedTerms }
}

/** Display the most-used surface form of a stem (tie-break: shortest, then alpha). */
function pickSurfaceForm(forms: Map<string, number>): string {
  return [...forms.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]),
  )[0][0]
}
