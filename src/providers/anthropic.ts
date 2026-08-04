import type { LLMProvider } from './types'
import type { GenerateRequest, GenerateResponse, ModelInfo } from '../types'
import { extraOutputProperties, normalizeExtras, EXTRA_OUTPUT_KEYS } from '../utils/extraOutputs'
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
    const extraProps = extraOutputProperties(req.extraOutputs, imageCount)

    const res = await fetch('/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: req.model,
        // Headroom for per-image alt text plus a Threads post on top of the caption
        max_tokens: 2048,
        system: req.systemPrompt,
        messages: [{ role: 'user', content }],
        tools: [
          req.templateLLMFields
            ? {
                name: 'template_fill',
                description: 'Fill template placeholders for a social media post',
                input_schema: {
                  type: 'object',
                  properties: {
                    ...Object.fromEntries(
                      req.templateLLMFields.map((f) => [f.key, { type: 'string', description: `Value for the "${f.key}" placeholder` }])
                    ),
                    ...extraProps,
                  },
                  required: [...req.templateLLMFields.map((f) => f.key), ...Object.keys(extraProps)],
                },
              }
            : {
                name: 'social_post',
                description: 'Generate a social media post draft',
                input_schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'A compelling title for the post' },
                    caption: { type: 'string', description: 'The full caption text for the social media post' },
                    hashtags: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Relevant hashtags without the # symbol',
                    },
                    ...extraProps,
                  },
                  required: ['title', 'caption', 'hashtags', ...Object.keys(extraProps)],
                },
              },
        ],
        tool_choice: { type: 'tool', name: req.templateLLMFields ? 'template_fill' : 'social_post' },
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error?.message || `Anthropic API error: ${res.status}`)
    }

    const data = await res.json()
    const raw = JSON.stringify(data, null, 2)

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
          ...extras,
        }
      }
      return {
        title: toolUse.input.title || '',
        caption: toolUse.input.caption || '',
        hashtags: (toolUse.input.hashtags || []).map((h: string) => h.replace(/^#/, '')),
        templateFields: {},
        raw,
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
        }
      } catch {}
    }

    throw new Error('Unexpected response format from Anthropic API')
  },
}
