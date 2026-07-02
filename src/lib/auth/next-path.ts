export function sanitizeInternalNext(value: string | null | undefined, fallback = '/dashboard') {
  const next = value?.trim()
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback
  return next
}
