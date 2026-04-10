import type { LLMProvider } from './types'
import type { GenerateRequest, GenerateResponse, ModelInfo } from '../types'
import { providerConfigs } from '../store'

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
        format: 'json',
        stream: false,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Ollama error: ${res.status} ${text}`)
    }

    const data = await res.json()
    const raw = data.message?.content || ''

    return parseResponse(raw)
  },
}

function parseResponse(raw: string): GenerateResponse {
  try {
    const parsed = JSON.parse(raw)
    return {
      title: parsed.title || '',
      caption: parsed.caption || '',
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map((h: string) => h.replace(/^#/, '')) : [],
      templateFields: parsed.templateFields || {},
      raw,
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
