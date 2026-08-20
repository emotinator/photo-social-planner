export type PlatformId = 'instagram' | 'threads' | 'linkedin' | 'facebook'

export interface DraftImage {
  id: string
  blob: Blob
  thumbnail: Blob
  filename: string
  mimeType: string
  width: number
  height: number
}

export interface Draft {
  id: string
  createdAt: string
  updatedAt: string
  status: 'draft' | 'planned' | 'posted'
  platform: PlatformId

  images: DraftImage[]
  title: string
  caption: string
  hashtags: string[]
  templateFields: Record<string, string>
  notes: string

  /** One alt text per image, in carousel order (Instagram sets alt per slide) */
  altText?: string[]
  threadsPost?: string

  generatedWith?: {
    provider: string
    model: string
    timestamp: string
  }

  plannedDate?: string
  planOrder?: number

  // Template mode
  assembledPost?: string
  templateId?: string
  templateResolution?: TemplateResolution
}

export interface TemplateField {
  key: string
  label: string
  description: string
  type: 'text' | 'multiline'
}

export interface Template {
  id: string
  name: string
  fields: TemplateField[]
}

// Caption template system
export interface PostTemplate {
  id: string
  name: string
  body: string          // raw text with [LLM ...] and [User ...] placeholders
  createdAt: string
  updatedAt: string
}

export interface SnippetSet {
  id: string
  name: string          // matches [User <name>] in templates
  options: string[]     // user picks one per post
  createdAt: string
  updatedAt: string
}

export interface TemplateResolution {
  templateId: string
  snippetSelections: Record<string, string>  // set name → chosen option
  llmFills: Record<string, string>           // placeholder key → generated text
}

export interface CaptionVoice {
  id: string
  name: string              // "Warm & Reflective", "Punchy & Edgy"
  description: string       // detailed prompt descriptor for the LLM
  createdAt: string
  updatedAt: string
}

export interface ParsedPlaceholder {
  raw: string           // e.g. "[LLM Caption]"
  type: 'llm' | 'user'
  key: string           // e.g. "Caption" or "Lighting-Set"
  start: number
  end: number
}

export interface ModelInfo {
  id: string
  name: string
  supportsVision: boolean
  size?: string
}

/** Outputs requested alongside the main caption, in the same LLM call */
export interface ExtraOutputs {
  altText?: boolean
  threadsPost?: boolean
}

export interface GenerateRequest {
  model: string
  images: { base64: string; mimeType: string }[]
  systemPrompt: string
  userPrompt: string
  platform: PlatformId
  templateFields?: TemplateField[]
  templateLLMFields?: { key: string }[]
  /** When false, no title/caption/hashtags are requested — extras only */
  wantCaption?: boolean
  extraOutputs?: ExtraOutputs
  /** Number of images in the post — alt text returns one entry per image */
  imageCount?: number
  /** Character ceiling for the Threads post, after reserving the credits block */
  threadsBudget?: number
}

/**
 * How long one provider call took. `wallMs` is measured around the request and
 * is always present; the rest is whatever the provider reports about its own
 * work, so the breakdown is there for Ollama and absent for Anthropic.
 */
export interface CallTimings {
  wallMs: number
  /** Time spent loading the model into memory — nonzero only on a cold call */
  loadMs?: number
  promptMs?: number
  genMs?: number
  promptTokens?: number
  genTokens?: number
}

/** What one generation run spent, for performance visibility in the UI */
export interface GenerationStats {
  model: string
  imageCount: number
  /** Downscaling the images before any call goes out */
  prepMs: number
  calls: CallTimings[]
}

export interface GenerateResponse {
  title: string
  caption: string
  hashtags: string[]
  templateFields: Record<string, string>
  llmFills?: Record<string, string>
  raw: string
  /** One alt text per image, in carousel order */
  altText?: string[]
  threadsPost?: string
  timings?: CallTimings
}

export interface ProviderConfig {
  id: string
  enabled: boolean
  apiKey?: string
  baseUrl?: string
  defaultModel?: string
}

export interface PlatformConfig {
  id: PlatformId
  name: string
  captionMaxLength: number
  hashtagLimit: number
}

/**
 * Instagram accepts up to 1000 characters of alt text. The opening description is
 * what a screen reader leads with, so it stays short; the remaining room is spare
 * capacity for genuinely relevant searchable detail, not a target to fill.
 */
export const ALT_TEXT_MAX = 1000
export const ALT_TEXT_DESCRIPTION_TARGET = 125

export const PLATFORMS: Record<PlatformId, PlatformConfig> = {
  instagram: { id: 'instagram', name: 'Instagram', captionMaxLength: 2200, hashtagLimit: 5 },
  threads: { id: 'threads', name: 'Threads', captionMaxLength: 500, hashtagLimit: 0 },
  linkedin: { id: 'linkedin', name: 'LinkedIn', captionMaxLength: 3000, hashtagLimit: 5 },
  facebook: { id: 'facebook', name: 'Facebook', captionMaxLength: 63206, hashtagLimit: 30 },
}
