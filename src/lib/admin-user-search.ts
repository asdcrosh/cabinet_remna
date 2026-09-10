import type { Prisma } from '@prisma/client'

const MAX_SIGNED_BIGINT = BigInt('9223372036854775807')

export function buildAdminUserSearchFilters(rawQuery: string): Prisma.UserWhereInput[] {
  const query = rawQuery.trim()
  if (!query) return []

  const telegramQuery = query.replace(/^@+/, '')
  const telegramId = parseTelegramId(telegramQuery)

  return [
    { id: { equals: query } },
    { email: { contains: query, mode: 'insensitive' } },
    { name: { contains: query, mode: 'insensitive' } },
    { remnawaveUsername: { contains: query, mode: 'insensitive' } },
    ...(telegramQuery
      ? [{ telegramUsername: { contains: telegramQuery, mode: 'insensitive' as const } }]
      : []),
    ...(telegramId === null ? [] : [{ telegramId: { equals: telegramId } }]),
  ]
}

function parseTelegramId(value: string) {
  if (!/^\d{1,19}$/.test(value)) return null
  const parsed = BigInt(value)
  return parsed <= MAX_SIGNED_BIGINT ? parsed : null
}
