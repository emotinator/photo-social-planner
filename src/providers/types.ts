import type { GenerateRequest, GenerateResponse, ModelInfo } from '../types'

export interface LLMProvider {
  id: string
  name: string
  supportsVision: boolean
  testConnection(): Promise<{ ok: boolean; error?: string }>
  listModels(): Promise<ModelInfo[]>
  generate(req: GenerateRequest): Promise<GenerateResponse>
}
