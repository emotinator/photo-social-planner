import type { PlatformId } from '../types'
import { PLATFORMS } from '../types'
import type { CaptionLength, TitleLength } from '../store'

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
  1: { label: '1 word', instruction: 'Write a single-word title — one powerful, evocative word.' },
  2: { label: '2 words', instruction: 'Write a 2-word title — punchy and evocative, like a photo series name.' },
  4: { label: '4 words', instruction: 'Write a 3-4 word title — concise and attention-grabbing.' },
  6: { label: '6 words', instruction: 'Write a 5-6 word title — descriptive but tight.' },
  8: { label: '8 words', instruction: 'Write a 7-8 word title — a short sentence that hooks the reader.' },
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

export function buildSystemPrompt(platform: PlatformId, voiceDescription?: string, captionLen: CaptionLength = 1, titleWords: TitleLength = 6): string {
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
- "hashtags": An array of relevant hashtags WITHOUT the # symbol (max ${config.hashtagLimit} hashtags)

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

export function buildTemplateSystemPrompt(platform: PlatformId, llmFields: { key: string }[], voiceDescription?: string, captionLen: CaptionLength = 1, titleWords: TitleLength = 6, templateStaticChars: number = 0): string {
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
${fieldList}

Guidelines for ${config.name}:
${platform === 'instagram' ? `- Captions should be engaging, tell a story or share insight about the photo
- Use line breaks and spacing for readability
- The first line should hook the reader` : ''}
${platform === 'threads' ? `- Keep it concise and conversational` : ''}
${platform === 'linkedin' ? `- Professional tone, share industry insights
- Focus on value and expertise` : ''}${lengthInstruction}${voiceDescription ? `\n\nIMPORTANT - Write all text content in this voice/tone:\n${voiceDescription}` : ''}

Respond ONLY with valid JSON. No markdown, no code blocks, just the JSON object.`
}

export function buildUserPrompt(notes: string, imageCount: number, snippetSelections?: Record<string, string>): string {
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

  prompt += '\n\nPlease analyze the image(s) and create a social media post draft.'

  return prompt
}
