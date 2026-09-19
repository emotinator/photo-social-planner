import type { Draft } from '../types'

/** True when the draft carries a main caption (plain or assembled from a template) */
export function hasCaptionPost(draft: Draft): boolean {
  return !!(draft.assembledPost || draft.caption)
}

/**
 * Which planned-date rows a draft gets. The caption row is the fallback, so a
 * draft saved before anything was generated still has one date to set.
 */
export function planDateSlots(draft: Draft): { caption: boolean; threads: boolean } {
  const threads = !!draft.threadsPost
  return { caption: hasCaptionPost(draft) || !threads, threads }
}

/**
 * When the Threads post goes out. Without a date of its own it follows the main
 * planned date, so both posts share a day unless the Threads one is pinned elsewhere.
 */
export function threadsDate(draft: Draft): string | undefined {
  return draft.threadsPlannedDate || draft.plannedDate
}

/** The date a draft sorts by: whichever is set, the earlier one when both are */
export function earliestPlannedDate(draft: Draft): string | undefined {
  const { caption, threads } = planDateSlots(draft)
  const dates = [caption && draft.plannedDate, threads && threadsDate(draft)].filter(Boolean) as string[]
  return dates.sort()[0]
}
