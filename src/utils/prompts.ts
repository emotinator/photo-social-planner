import type { PlatformId } from '../types'
import { PLATFORMS } from '../types'

export function buildSystemPrompt(platform: PlatformId, voiceDescription?: string): string {
  const config = PLATFORMS[platform]

  const voiceInstruction = voiceDescription
    ? `\n\nIMPORTANT - Write the caption in this voice/tone:\n${voiceDescription}`
    : ''

  return `You are a social media content expert specializing in photography posts. Your job is to analyze photographs and create compelling social media posts.

You must respond with a JSON object containing:
- "title": A short, compelling title for the post (max 60 characters)
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
- Focus on value and expertise` : ''}${voiceInstruction}

Respond ONLY with valid JSON. No markdown, no code blocks, just the JSON object.`
}

export function buildTemplateSystemPrompt(platform: PlatformId, llmFields: { key: string }[], voiceDescription?: string): string {
  const config = PLATFORMS[platform]

  const fieldList = llmFields.map((f) => {
    const key = f.key
    // Derive description from key name
    if (key.toLowerCase() === 'title') return `- "${key}": A short, compelling title for the post (max 60 characters)`
    if (key.toLowerCase() === 'caption') return `- "${key}": The full caption text for ${config.name} (max ${config.captionMaxLength} characters). Write in a natural, engaging voice.`
    if (key.toLowerCase() === 'hashtags') return `- "${key}": A string of space-separated hashtags with # symbols (max ${config.hashtagLimit} hashtags)`
    return `- "${key}": A relevant, well-written value for the "${key}" field`
  }).join('\n')

  return `You are a social media content expert specializing in photography posts. You are filling placeholders in a post template for ${config.name}.

You must respond with a JSON object containing these fields:
${fieldList}

Guidelines for ${config.name}:
${platform === 'instagram' ? `- Captions should be engaging, tell a story or share insight about the photo
- Use line breaks and spacing for readability
- The first line should hook the reader` : ''}
${platform === 'threads' ? `- Keep it concise and conversational` : ''}
${platform === 'linkedin' ? `- Professional tone, share industry insights
- Focus on value and expertise` : ''}${voiceDescription ? `\n\nIMPORTANT - Write all text content in this voice/tone:\n${voiceDescription}` : ''}

Respond ONLY with valid JSON. No markdown, no code blocks, just the JSON object.`
}

export function buildUserPrompt(notes: string, imageCount: number): string {
  let prompt = `I'm sharing ${imageCount === 1 ? 'this photograph' : `these ${imageCount} photographs`}.`

  if (notes.trim()) {
    prompt += `\n\nHere are my notes about ${imageCount === 1 ? 'this image' : 'these images'}:\n${notes}`
  }

  prompt += '\n\nPlease analyze the image(s) and create a social media post draft.'

  return prompt
}
