import { signal } from '@preact/signals'
import type { Draft, DraftImage, ProviderConfig, PlatformId, GenerateResponse, PostTemplate, SnippetSet, CaptionVoice } from '../types'

export type TabId = 'images' | 'generate' | 'templates' | 'preview' | 'deliver' | 'plan' | 'settings'

// UI state
export const activeTab = signal<TabId>('images')
export const theme = signal<'dark' | 'light'>(
  (localStorage.getItem('psp-theme') as 'dark' | 'light') || 'dark'
)

// Apply theme on change
const applyTheme = (t: 'dark' | 'light') => {
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : '')
  localStorage.setItem('psp-theme', t)
}
applyTheme(theme.value)

export const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme(theme.value)
}

// Caption & title length controls
export type CaptionLength = 0.5 | 1 | 2 | 3 | 0  // 0 = no limit
export type TitleLength = 1 | 2 | 4 | 6 | 8 | 0    // word count, 0 = no limit
export const captionLength = signal<CaptionLength>(1)
export const titleLength = signal<TitleLength>(6)

// Current draft workspace
export const currentImages = signal<DraftImage[]>([])
export const currentNotes = signal('')
export const currentPlatform = signal<PlatformId>('instagram')
export const previewIndex = signal(0)

// Flag to distinguish internal reorder drags from external file drops
export const isReorderDrag = signal(false)

// Generation state
export const isGenerating = signal(false)
export const generationError = signal<string | null>(null)
export const generationResult = signal<GenerateResponse | null>(null)

// Editable result fields (post-generation)
export const editTitle = signal('')
export const editCaption = signal('')
export const editHashtags = signal<string[]>([])

// Template state
export const allTemplates = signal<PostTemplate[]>([])
export const allSnippetSets = signal<SnippetSet[]>([])
export const selectedTemplateId = signal<string | null>(null) // null = classic mode
export const snippetSelections = signal<Record<string, string>>({})
export const assembledPost = signal('')

// Caption voice state
export const allCaptionVoices = signal<CaptionVoice[]>([])
export const selectedVoiceIds = signal<string[]>([])   // multi-select
export const voiceVariants = signal<Record<string, string>>({})  // voiceId -> generated caption
export const chosenVoiceId = signal<string | null>(null)  // which variant user picked

// Provider state
export const selectedProvider = signal('ollama')
export const selectedModel = signal('')
export const availableModels = signal<{ id: string; name: string }[]>([])

// Provider configs
export const providerConfigs = signal<Record<string, ProviderConfig>>({
  ollama: {
    id: 'ollama',
    enabled: true,
    baseUrl: 'http://localhost:11434',
    defaultModel: 'gemma4',
  },
  anthropic: {
    id: 'anthropic',
    enabled: true,
    apiKey: '',
    defaultModel: 'claude-sonnet-4-20250514',
  },
})

// Plan (saved drafts)
export const savedDrafts = signal<Draft[]>([])
export const editingDraftId = signal<string | null>(null)

// Toast
export interface ToastMsg {
  id: string
  message: string
  type: 'info' | 'success' | 'error'
}
export const toasts = signal<ToastMsg[]>([])

export const showToast = (message: string, type: ToastMsg['type'] = 'info') => {
  const id = crypto.randomUUID()
  toasts.value = [...toasts.value, { id, message, type }]
  setTimeout(() => {
    toasts.value = toasts.value.filter((t: ToastMsg) => t.id !== id)
  }, 3000)
}

// ── Persist & restore settings from localStorage ──
import { effect } from '@preact/signals'

// Provider configs
const savedConfigs = localStorage.getItem('psp-providers')
if (savedConfigs) {
  try {
    const parsed = JSON.parse(savedConfigs)
    providerConfigs.value = { ...providerConfigs.value, ...parsed }
  } catch {}
}
effect(() => {
  localStorage.setItem('psp-providers', JSON.stringify(providerConfigs.value))
})

// Restore last-used generation settings
const savedSettings = localStorage.getItem('psp-gen-settings')
if (savedSettings) {
  try {
    const s = JSON.parse(savedSettings)
    if (s.provider) selectedProvider.value = s.provider
    if (s.model) selectedModel.value = s.model
    if (s.platform) currentPlatform.value = s.platform
    if (s.captionLength !== undefined) captionLength.value = s.captionLength
    if (s.titleLength !== undefined) titleLength.value = s.titleLength
    if (s.templateId !== undefined) selectedTemplateId.value = s.templateId
  } catch {}
}

// Auto-save generation settings
effect(() => {
  localStorage.setItem('psp-gen-settings', JSON.stringify({
    provider: selectedProvider.value,
    model: selectedModel.value,
    platform: currentPlatform.value,
    captionLength: captionLength.value,
    titleLength: titleLength.value,
    templateId: selectedTemplateId.value,
  }))
})
