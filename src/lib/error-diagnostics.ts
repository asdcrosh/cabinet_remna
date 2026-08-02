const SENSITIVE_KEY = /(?:authorization|cookie|password|passwd|secret|token|api[_-]?key|private[_-]?key)/i
const MAX_TEXT_LENGTH = 8_000
const MAX_DEPTH = 5

export interface ServerErrorDiagnostics {
  reason: string
  type: string
  code?: string
  causes?: Array<{ type: string; reason: string; code?: string }>
}

export function sanitizeDiagnosticText(value: string) {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[скрыто]')
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, '$1[скрыто]@')
    .replace(/((?:authorization|cookie|password|passwd|secret|token|api[_-]?key|private[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, '$1[скрыто]')
    .slice(0, MAX_TEXT_LENGTH)
}

export function sanitizeDiagnosticValue(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return '[слишком глубокая структура]'
  if (typeof value === 'string') return sanitizeDiagnosticText(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (typeof value === 'undefined') return undefined
  if (value instanceof Error) {
    return {
      type: value.name,
      reason: sanitizeDiagnosticText(value.message),
      code: getErrorCode(value),
    }
  }
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeDiagnosticValue(item, depth + 1))
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([key, item]) => [
          key,
          SENSITIVE_KEY.test(key) ? '[скрыто]' : sanitizeDiagnosticValue(item, depth + 1),
        ])
    )
  }
  return sanitizeDiagnosticText(String(value))
}

export function buildServerErrorDiagnostics(error: unknown): ServerErrorDiagnostics {
  const chain: Array<{ type: string; reason: string; code?: string }> = []
  let current: unknown = error

  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) {
      chain.push({
        type: current.name || 'Error',
        reason: sanitizeDiagnosticText(current.message || 'Ошибка без описания'),
        code: getErrorCode(current),
      })
      current = current.cause
      continue
    }
    chain.push({ type: 'Error', reason: sanitizeDiagnosticText(String(current)) })
    break
  }

  const primary = chain[0] ?? { type: 'Error', reason: 'Неизвестная ошибка' }
  return {
    reason: primary.reason,
    type: primary.type,
    ...(primary.code ? { code: primary.code } : {}),
    ...(chain.length > 1 ? { causes: chain.slice(1) } : {}),
  }
}

function getErrorCode(error: Error) {
  const code = (error as Error & { code?: unknown }).code
  return typeof code === 'string' || typeof code === 'number'
    ? sanitizeDiagnosticText(String(code))
    : undefined
}
