import type { LLMProvider } from './types'
import type { CallTimings, GenerateRequest, GenerateResponse, ModelInfo } from '../types'
import { normalizeExtras, estimateMaxTokens, buildOutputSchema, EXTRA_OUTPUT_KEYS } from '../utils/extraOutputs'
import { providerConfigs } from '../store'

function getApiKey(): string {
  return providerConfigs.value.anthropic?.apiKey || ''
}

const MODELS: ModelInfo[] = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', supportsVision: true },
  { id: 'claude-haiku-4-20250414', name: 'Claude Haiku 4', supportsVision: true },
  { id: 'claude-opus-4-20250515', name: 'Claude Opus 4', supportsVision: true },
]

export const anthropicProvider: LLMProvider = {
  id: 'anthropic',
  name: 'Claude (Anthropic)',
  supportsVision: true,

  async testConnection() {
    const apiKey = getApiKey()
    if (!apiKey) return { ok: false, error: 'No API key configured' }

    try {
      const res = await fetch('/api/anthropic/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return { ok: false, error: data.error?.message || `HTTP ${res.status}` }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: 'Cannot reach Anthropic API via proxy' }
    }
  },

  async listModels(): Promise<ModelInfo[]> {
    return MODELS
  },

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const apiKey = getApiKey()
    if (!apiKey) throw new Error('No Anthropic API key configured')

    const content: any[] = []

    // Add images as content blocks
    for (const img of req.images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mimeType,
          data: img.base64,
        },
      })
    }

    // Add user text
    content.push({ type: 'text', text: req.userPrompt })

    const imageCount = req.imageCount ?? req.images.length
    const wantCaption = req.wantCaption !== false
    const isTemplate = !!req.templateLLMFields

    // Same schema both providers use — caption keys drop out when the caption
    // wasn't asked for, and alt text carries a per-image min/max item count
    const schema = buildOutputSchema({
      templateLLMFields: req.templateLLMFields,
      wantCaption: req.wantCaption,
      extraOutputs: req.extraOutputs,
      imageCount,
      threadsBudget: req.threadsBudget,
    })

    const startedAt = performance.now()
    const res = await fetch('/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: req.model,
        // Sized to what was requested — a flat ceiling truncates long carousels
        max_tokens: estimateMaxTokens(wantCaption, req.extraOutputs, imageCount),
        system: req.systemPrompt,
        messages: [{ role: 'user', content }],
        tools: [
          isTemplate
            ? {
                name: 'template_fill',
                description: 'Fill template placeholders for a social media post',
                input_schema: schema,
              }
            : {
                name: 'social_post',
                description: wantCaption
                  ? 'Generate a social media post draft'
                  : 'Generate the requested outputs for a set of photographs',
                input_schema: schema,
              },
        ],
        tool_choice: { type: 'tool', name: isTemplate ? 'template_fill' : 'social_post' },
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error?.message || `Anthropic API error: ${res.status}`)
    }

    const data = await res.json()
    const raw = JSON.stringify(data, null, 2)

    // The API reports tokens, not durations, so the breakdown stays empty here
    // and only the wall clock is comparable against a local model.
    const timings: CallTimings = {
      wallMs: performance.now() - startedAt,
      promptTokens: data.usage?.input_tokens,
      genTokens: data.usage?.output_tokens,
    }

    // A truncated response still parses — the tool call just comes back with some
    // keys missing or an alt text array cut short. Fail loudly instead of handing
    // back a half-filled result that looks like the model simply stopped early.
    if (data.stop_reason === 'max_tokens') {
      throw new Error(
        `The model ran out of room before finishing${imageCount > 1 ? ` all ${imageCount} images` : ''}. ` +
        `Try fewer images, or turn off an output you don't need.`
      )
    }

    // Extract tool use result
    const toolUse = data.content?.find((c: any) => c.type === 'tool_use')
    if (toolUse?.input) {
      const extras = normalizeExtras(toolUse.input, req.extraOutputs, imageCount)

      // Template mode: return all fills as llmFills
      if (req.templateLLMFields) {
        // Extras share the tool input but are not template placeholders — keep them out of the fills
        const fills = Object.fromEntries(
          Object.entries(toolUse.input as Record<string, string>)
            .filter(([k]) => !(EXTRA_OUTPUT_KEYS as readonly string[]).includes(k))
        )
        return {
          title: '',
          caption: '',
          hashtags: [],
          templateFields: {},
          llmFills: fills,
          raw,
          timings,
          ...extras,
        }
      }
      return {
        title: toolUse.input.title || '',
        caption: toolUse.input.caption || '',
        hashtags: (toolUse.input.hashtags || []).map((h: string) => h.replace(/^#/, '')),
        templateFields: {},
        raw,
        timings,
        ...extras,
      }
    }

    // Fallback: extract from text response
    const textBlock = data.content?.find((c: any) => c.type === 'text')
    if (textBlock?.text) {
      try {
        const parsed = JSON.parse(textBlock.text)
        return {
          title: parsed.title || '',
          caption: parsed.caption || '',
          hashtags: (parsed.hashtags || []).map((h: string) => h.replace(/^#/, '')),
          templateFields: {},
          raw,
          timings,
        }
      } catch {}
    }

    throw new Error('Unexpected response format from Anthropic API')
  },
}
