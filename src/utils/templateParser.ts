import type { ParsedPlaceholder } from '../types'

const PLACEHOLDER_RE = /\[(LLM|User)\s+([^\]]+)\]/g

export function parsePlaceholders(body: string): ParsedPlaceholder[] {
  const results: ParsedPlaceholder[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(PLACEHOLDER_RE.source, PLACEHOLDER_RE.flags)
  while ((match = re.exec(body)) !== null) {
    results.push({
      raw: match[0],
      type: match[1].toLowerCase() as 'llm' | 'user',
      key: match[2].trim(),
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return results
}

export function extractLLMFields(body: string): string[] {
  const placeholders = parsePlaceholders(body)
  const keys = placeholders.filter((p) => p.type === 'llm').map((p) => p.key)
  return [...new Set(keys)]
}

export function extractUserFields(body: string): string[] {
  const placeholders = parsePlaceholders(body)
  const keys = placeholders.filter((p) => p.type === 'user').map((p) => p.key)
  return [...new Set(keys)]
}

export function assembleTemplate(
  body: string,
  llmFills: Record<string, string>,
  snippetSelections: Record<string, string>
): string {
  return body.replace(PLACEHOLDER_RE, (_match, type: string, key: string) => {
    const k = key.trim()
    if (type === 'LLM') {
      return llmFills[k] ?? `[LLM ${k}]`
    }
    if (type === 'User') {
      return snippetSelections[k] ?? `[User ${k}]`
    }
    return _match
  })
}

/** Count the static (non-placeholder) characters in a template body */
export function staticTextLength(body: string): number {
  return body.replace(PLACEHOLDER_RE, '').length
}

export function validateTemplate(
  body: string,
  availableSetNames: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const userFields = extractUserFields(body)
  const llmFields = extractLLMFields(body)

  for (const name of userFields) {
    if (!availableSetNames.includes(name)) {
      errors.push(`No snippet set found for [User ${name}]`)
    }
  }

  if (llmFields.length === 0 && userFields.length === 0) {
    errors.push('Template has no placeholders. Add [LLM ...] or [User ...] blocks.')
  }

  return { valid: errors.length === 0, errors }
}
