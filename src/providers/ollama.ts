import type { LLMProvider } from './types'
import type { CallTimings, GenerateRequest, GenerateResponse, ModelInfo } from '../types'
import { providerConfigs } from '../store'
import { normalizeExtras, normalizeVoiceOutputs, estimateMaxTokens, buildOutputSchema, EXTRA_OUTPUT_KEYS } from '../utils/extraOutputs'

const VISION_MODELS = ['gemma4', 'gemma3', 'llava', 'llava-llama3', 'llama3.2-vision', 'moondream', 'qwen2.5-vl']

function getBaseUrl(): string {
  return providerConfigs.value.ollama?.baseUrl || 'http://localhost:11434'
}

export const ollamaProvider: LLMProvider = {
  id: 'ollama',
  name: 'Ollama (Local)',
  supportsVision: true,

  async testConnection() {
    try {
      const res = await fetch(`${getBaseUrl()}/api/tags`)
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: 'Cannot connect to Ollama. Is it running?' }
    }
  },

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${getBaseUrl()}/api/tags`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.models || []).map((m: any) => {
        const name = m.name || m.model || ''
        const baseName = name.split(':')[0].toLowerCase()
        const supportsVision = VISION_MODELS.some((v) => baseName.includes(v))
        return {
          id: name,
          name: name,
          supportsVision,
          size: m.size ? `${(m.size / 1e9).toFixed(1)}GB` : undefined,
        }
      })
    } catch {
      return []
    }
  },

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const base = getBaseUrl()

    const systemPrompt = req.systemPrompt
    const userPrompt = req.userPrompt
    const imgCount = req.imageCount ?? req.images.length

    // `format: 'json'` only buys syntactically valid JSON — the model still decides
    // how many alt texts to write, and local models routinely stop at half. Handing
    // Ollama the real schema constrains decoding, so the per-image count is enforced.
    const schema = buildOutputSchema({
      templateLLMFields: req.templateLLMFields,
      wantCaption: req.wantCaption,
      extraOutputs: req.extraOutputs,
      imageCount: imgCount,
      threadsBudget: req.threadsBudget,
      voices: req.voices,
      captionBudget: req.captionBudget,
    })

    const startedAt = performance.now()
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: userPrompt,
            images: req.images.map((img) => img.base64),
          },
        ],
        format: schema,
        // Gemma4 reasons before answering unless told not to. That reasoning is
        // billed against num_predict, so a long think leaves the JSON truncated
        // — or, when it runs to the ceiling, empty. It also costs ~5x wall clock
        // (26b: 29-45s thinking vs 5-13s without) for copy that needs no reasoning.
        think: false,
        stream: false,
        options: {
          // Without this Ollama inherits whatever local default applies, which
          // can cut long carousels off partway through the alt text array
          num_predict: estimateMaxTokens(req.wantCaption !== false, req.extraOutputs, imgCount, req.voices?.length),
        },
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Ollama error: ${res.status} ${text}`)
    }

    const data = await res.json()
    const raw = data.message?.content || ''

    // Ollama reports its own durations in nanoseconds. They are worth keeping
    // apart: a slow call because the model was cold reads very differently from
    // a slow call because the prompt was long.
    const ns = (v: unknown) => (typeof v === 'number' ? v / 1e6 : undefined)
    const timings: CallTimings = {
      wallMs: performance.now() - startedAt,
      loadMs: ns(data.load_duration),
      promptMs: ns(data.prompt_eval_duration),
      genMs: ns(data.eval_duration),
      promptTokens: data.prompt_eval_count,
      genTokens: data.eval_count,
    }

    // Template mode: extract all keys as llmFills
    if (req.templateLLMFields) {
      return { ...parseTemplateResponse(raw, req.templateLLMFields.map((f) => f.key), req.extraOutputs, imgCount), timings }
    }

    return { ...parseResponse(raw, req.extraOutputs, imgCount, req.voices), timings }
  },
}

function parseTemplateResponse(
  raw: string,
  expectedKeys: string[],
  extras?: GenerateRequest['extraOutputs'],
  imageCount: number = 1
): GenerateResponse {
  try {
    const parsed = JSON.parse(raw)
    const llmFills: Record<string, string> = {}
    for (const key of expectedKeys) {
      if ((EXTRA_OUTPUT_KEYS as readonly string[]).includes(key)) continue
      llmFills[key] = String(parsed[key] || '')
    }
    return {
      title: '',
      caption: '',
      hashtags: [],
      templateFields: {},
      llmFills,
      raw,
      ...normalizeExtras(parsed, extras, imageCount),
    }
  } catch {
    return {
      title: '',
      caption: raw,
      hashtags: [],
      templateFields: {},
      llmFills: {},
      raw,
    }
  }
}

function parseResponse(
  raw: string,
  extras?: GenerateRequest['extraOutputs'],
  imageCount: number = 1,
  voices?: GenerateRequest['voices']
): GenerateResponse {
  try {
    const parsed = JSON.parse(raw)
    return {
      title: parsed.title || '',
      caption: parsed.caption || '',
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map((h: string) => h.replace(/^#/, '')) : [],
      templateFields: parsed.templateFields || {},
      raw,
      ...normalizeExtras(parsed, extras, imageCount),
      ...normalizeVoiceOutputs(parsed, voices),
    }
  } catch {
    // Fallback: try to extract from text
    const titleMatch = raw.match(/title[:\s]*["']?([^"'\n]+)/i)
    const captionMatch = raw.match(/caption[:\s]*["']?([^"'\n]+)/i)
    const hashtagMatch = raw.match(/#\w+/g)

    return {
      title: titleMatch?.[1]?.trim() || '',
      caption: captionMatch?.[1]?.trim() || raw,
      hashtags: hashtagMatch?.map((h) => h.replace(/^#/, '')) || [],
      templateFields: {},
      raw,
    }
  }
}
