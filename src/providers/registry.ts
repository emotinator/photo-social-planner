import type { LLMProvider } from './types'
import { ollamaProvider } from './ollama'
import { anthropicProvider } from './anthropic'

const providers: Map<string, LLMProvider> = new Map()

// Register built-in providers
providers.set('ollama', ollamaProvider)
providers.set('anthropic', anthropicProvider)

export function getProvider(id: string): LLMProvider | undefined {
  return providers.get(id)
}

export function getAllProviders(): LLMProvider[] {
  return Array.from(providers.values())
}

export function registerProvider(provider: LLMProvider): void {
  providers.set(provider.id, provider)
}
