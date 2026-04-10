import { signal } from '@preact/signals'
import type { Draft, DraftImage, ProviderConfig, PlatformId, GenerateResponse } from '../types'

export type TabId = 'images' | 'generate' | 'preview' | 'plan' | 'settings'

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

// Load provider configs from localStorage
const savedConfigs = localStorage.getItem('psp-providers')
if (savedConfigs) {
  try {
    const parsed = JSON.parse(savedConfigs)
    providerConfigs.value = { ...providerConfigs.value, ...parsed }
  } catch {}
}

// Auto-save provider configs
import { effect } from '@preact/signals'
effect(() => {
  localStorage.setItem('psp-providers', JSON.stringify(providerConfigs.value))
})
