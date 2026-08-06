import type { PlatformId, ExtraOutputs } from '../types'
import { PLATFORMS } from '../types'
import type { CaptionLength, TitleLength } from '../store'
import type { RepetitionContext } from './repetition'

/* ── Length guidance ── */

interface LengthSpec {
  label: string
  instruction: string
  approxChars: number  // rough target for budget calculation
}

const LENGTH_SPECS: Record<number, LengthSpec> = {
  0.5: { label: 'Micro', instruction: 'Write an extremely concise caption — only 1-2 sentences. Brevity is key.', approxChars: 150 },
  1:   { label: '1 paragraph', instruction: 'Write a single short paragraph caption (3-5 sentences). Keep it focused and punchy.', approxChars: 400 },
  2:   { label: '2 paragraphs', instruction: 'Write a 2-paragraph caption with a line break between them. First paragraph hooks, second adds depth or context.', approxChars: 700 },
  3:   { label: '3 paragraphs', instruction: 'Write a 3-paragraph caption. Hook → story/insight → call-to-action or reflection. Use line breaks between paragraphs.', approxChars: 1100 },
  0:   { label: 'No limit', instruction: 'Write a caption at whatever length best serves the content. Use as much space as the platform allows.', approxChars: 0 },
}

export function getLengthSpec(len: CaptionLength): LengthSpec {
  return LENGTH_SPECS[len] || LENGTH_SPECS[1]
}

/* ── Title length guidance ── */

interface TitleSpec {
  label: string
  instruction: string
}

const TITLE_SPECS: Record<number, TitleSpec> = {
  1: { label: 'Up to 1 word', instruction: 'Write a single-word title — one powerful, evocative word.' },
  2: { label: 'Up to 2 words', instruction: 'Write a title of up to 2 words — punchy and evocative, like a photo series name. Fewer is fine.' },
  4: { label: 'Up to 4 words', instruction: 'Write a title of at most 4 words — concise and attention-grabbing. Fewer is fine.' },
  6: { label: 'Up to 6 words', instruction: 'Write a title of at most 6 words — descriptive but tight. Fewer is fine.' },
  8: { label: 'Up to 8 words', instruction: 'Write a title of at most 8 words — a short phrase that hooks the reader. Fewer is fine.' },
  0: { label: 'No limit', instruction: 'Write a compelling title at whatever length best fits (max 60 characters).' },
}

export function getTitleSpec(len: TitleLength): TitleSpec {
  return TITLE_SPECS[len] || TITLE_SPECS[6]
}

/** Calculate available character budget for LLM-generated content */
export function calcCaptionBudget(platform: PlatformId, captionLen: CaptionLength, templateStaticChars: number = 0): { budget: number; platformMax: number } {
  const platformMax = PLATFORMS[platform].captionMaxLength
  const spec = getLengthSpec(captionLen)
  if (captionLen === 0) return { budget: platformMax - templateStaticChars, platformMax }
  const available = platformMax - templateStaticChars
  return { budget: Math.min(spec.approxChars, available), platformMax }
}

function buildLengthInstruction(captionLen: CaptionLength, budgetChars?: number): string {
  const spec = getLengthSpec(captionLen)
  let instruction = `\n\nCAPTION LENGTH: ${spec.instruction}`
  if (budgetChars && budgetChars > 0 && captionLen !== 0) {
    instruction += ` Aim for roughly ${budgetChars} characters.`
  }
  return instruction
}

/* ── Extra outputs (alt text, Threads post) ── */

const THREADS_MAX = PLATFORMS.threads.captionMaxLength

/**
 * Models cannot count characters reliably — asking for "max 500" reliably
 * overshoots. We reserve the credits block, hold back a safety margin, and
 * state the target in words, which models track far better.
 */
const THREADS_SAFETY_MARGIN = 60
const CHARS_PER_WORD = 6.5

export interface ThreadsBudget {
  /** Characters the generated text may use */
  budget: number
  /** Roughly equivalent word count — the number actually given to the model */
  words: number
  /** Characters consumed by the credits block, including its separating newline */
  reserved: number
}

export function calcThreadsBudget(credits: string): ThreadsBudget {
  const reserved = credits.trim() ? credits.length + 1 : 0
  const budget = Math.max(80, THREADS_MAX - reserved - THREADS_SAFETY_MARGIN)
  return { budget, words: Math.round(budget / CHARS_PER_WORD), reserved }
}

/**
 * Describes the optional extra JSON keys the model should return alongside the
 * main caption. Appended to both the classic and template system prompts —
 * these outputs are independent of any post template.
 */
export function buildExtraOutputsInstruction(
  extras: ExtraOutputs | undefined,
  imageCount: number,
  threads?: ThreadsBudget
): string {
  if (!extras || (!extras.altText && !extras.threadsPost)) return ''

  let out = '\n\nADDITIONAL REQUIRED OUTPUT KEYS — include these in the same JSON object:'

  if (extras.altText) {
    out += `

- "altText": An array of exactly ${imageCount} string${imageCount === 1 ? '' : 's'}, one per image in the order given.
  Each entry is the Instagram alt text for that specific image. Alt text is read aloud by screen
  readers AND used by Instagram to understand and surface the photo, so write it to serve both:
  - Describe literally what is actually visible: subject, setting, action, light, colour, weather, time of day.
  - Aim for about 125 characters. One sentence is usually right. Never exceed 200.
  - Let searchable terms appear naturally because they are genuinely true of the photo — the location,
    the subject, the genre, the technique. Do NOT bolt on keywords that do not describe the image.
  - Never begin with "Image of", "Photo of", "A picture showing" or similar — start with the content itself.
  - No hashtags, no emoji, no marketing language, no calls to action.
  - Describe each image on its own terms. Do not write "the second image" or refer to the other slides.`
  }

  if (extras.threadsPost) {
    const b = threads ?? calcThreadsBudget('')
    out += `

- "threadsPost": A standalone post for Threads about the same photograph.
  Write it fresh for Threads — do NOT summarise or truncate the Instagram caption.
  - LENGTH IS STRICT: write about ${b.words} words. Absolute maximum ${b.budget} characters.
    A credits block is appended below your text afterwards, so the space you are given
    is all you get. Coming in 20% short is fine; going over is not — if in doubt, write less.
  - Conversational and direct, like talking to someone. Open with the thought, not a hook formula.
  - No hashtag block, no title, and no credits or @mentions — those are added separately.
  - End on your last sentence. Do NOT sign off with a credits line, a "Credits:" label,
    a placeholder such as "[credits]" or "[credits below]", or rows of dots — the real
    credits block is appended automatically and anything like it here is duplicated text.
  - Ending on an observation or a genuine question invites replies; do not force a call to action.`
  }

  return out
}

export function buildSystemPrompt(platform: PlatformId, voiceDescription?: string, captionLen: CaptionLength = 1, titleWords: TitleLength = 6, extras?: ExtraOutputs, imageCount: number = 1, threads?: ThreadsBudget): string {
  const config = PLATFORMS[platform]
  const { budget } = calcCaptionBudget(platform, captionLen)
  const titleSpec = getTitleSpec(titleWords)

  const voiceInstruction = voiceDescription
    ? `\n\nIMPORTANT - Write the caption in this voice/tone:\n${voiceDescription}`
    : ''

  const lengthInstruction = buildLengthInstruction(captionLen, budget)

  return `You are a social media content expert specializing in photography posts. Your job is to analyze photographs and create compelling social media posts.

You must respond with a JSON object containing:
- "title": ${titleSpec.instruction}
- "caption": The full caption text for ${config.name} (max ${config.captionMaxLength} characters). Write in a natural, engaging voice. Include line breaks for readability.
- "hashtags": An array of relevant hashtags WITHOUT the # symbol (max ${config.hashtagLimit} hashtags)${buildExtraOutputsInstruction(extras, imageCount, threads)}

Guidelines for ${config.name}:
${platform === 'instagram' ? `- Captions should be engaging, tell a story or share insight about the photo
- Mix popular and niche hashtags for discoverability
- Use line breaks and spacing for readability
- The first line should hook the reader` : ''}
${platform === 'threads' ? `- Keep it concise and conversational
- No hashtags needed on Threads` : ''}
${platform === 'linkedin' ? `- Professional tone, share industry insights
- Use fewer, more targeted hashtags
- Focus on value and expertise` : ''}${lengthInstruction}${voiceInstruction}

Respond ONLY with valid JSON. No markdown, no code blocks, just the JSON object.`
}

export function buildTemplateSystemPrompt(platform: PlatformId, llmFields: { key: string }[], voiceDescription?: string, captionLen: CaptionLength = 1, titleWords: TitleLength = 6, templateStaticChars: number = 0, extras?: ExtraOutputs, imageCount: number = 1, threads?: ThreadsBudget): string {
  const config = PLATFORMS[platform]
  const { budget } = calcCaptionBudget(platform, captionLen, templateStaticChars)
  const titleSpec = getTitleSpec(titleWords)

  const fieldList = llmFields.map((f) => {
    const key = f.key
    if (key.toLowerCase() === 'title') return `- "${key}": ${titleSpec.instruction}`
    if (key.toLowerCase() === 'caption') return `- "${key}": The caption text for ${config.name}. Write in a natural, engaging voice.`
    if (key.toLowerCase() === 'hashtags') return `- "${key}": A string of space-separated hashtags with # symbols (max ${config.hashtagLimit} hashtags)`
    return `- "${key}": A relevant, well-written value for the "${key}" field`
  }).join('\n')

  const lengthInstruction = buildLengthInstruction(captionLen, budget)

  return `You are a social media content expert specializing in photography posts. You are filling placeholders in a post template for ${config.name}.

You must respond with a JSON object containing these fields:
${fieldList}${buildExtraOutputsInstruction(extras, imageCount, threads)}

Guidelines for ${config.name}:
${platform === 'instagram' ? `- Captions should be engaging, tell a story or share insight about the photo
- Use line breaks and spacing for readability
- The first line should hook the reader` : ''}
${platform === 'threads' ? `- Keep it concise and conversational` : ''}
${platform === 'linkedin' ? `- Professional tone, share industry insights
- Focus on value and expertise` : ''}${lengthInstruction}${voiceDescription ? `\n\nIMPORTANT - Write all text content in this voice/tone:\n${voiceDescription}` : ''}

Respond ONLY with valid JSON. No markdown, no code blocks, just the JSON object.`
}

export function buildUserPrompt(notes: string, imageCount: number, snippetSelections?: Record<string, string>, repetition?: RepetitionContext): string {
  let prompt = `I'm sharing ${imageCount === 1 ? 'this photograph' : `these ${imageCount} photographs`}.`

  if (notes.trim()) {
    prompt += `\n\nHere are my notes about ${imageCount === 1 ? 'this image' : 'these images'}:\n${notes}`
  }

  if (snippetSelections) {
    const entries = Object.entries(snippetSelections).filter(([, v]) => v)
    if (entries.length > 0) {
      prompt += '\n\nAdditional context from the user (incorporate naturally into the post):'
      for (const [field, value] of entries) {
        prompt += `\n- ${field}: ${value}`
      }
    }
  }

  if (repetition && (repetition.usedTitles.length > 0 || repetition.overusedTerms.length > 0)) {
    prompt += '\n\nTo keep my upcoming posts feeling fresh and original (they should not read like variations of each other):'
    if (repetition.usedTitles.length > 0) {
      prompt += `\n- Do NOT reuse or closely echo these titles I've already used on planned posts: ${repetition.usedTitles.map((t) => `"${t}"`).join(', ')}`
    }
    if (repetition.overusedTerms.length > 0) {
      prompt += `\n- These descriptive words are already appearing a lot across my planned posts — avoid them here and reach for fresh alternatives: ${repetition.overusedTerms.map((t) => t.word).join(', ')}`
    }
  }

  prompt += '\n\nPlease analyze the image(s) and create a social media post draft.'

  return prompt
}
