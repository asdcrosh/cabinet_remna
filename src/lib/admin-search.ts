import type { Prisma } from '@prisma/client'

export const ADMIN_SEARCH_MIN_QUERY_LENGTH = 2
export const ADMIN_SEARCH_MAX_QUERY_LENGTH = 100
export const ADMIN_SEARCH_RESULT_LIMIT = 6

// Глобальный поиск принимает только осмысленные запросы: короткие и
// слишком длинные строки дают пустой результат без похода в базу.
export function normalizeAdminSearchQuery(raw: string | null | undefined) {
  const query = raw?.trim() ?? ''
  if (query.length < ADMIN_SEARCH_MIN_QUERY_LENGTH || query.length > ADMIN_SEARCH_MAX_QUERY_LENGTH) return null
  return query
}

// Те же поля, что ищет страница /dashboard/admin/payments.
export function buildAdminPaymentSearchFilters(rawQuery: string): Prisma.PaymentWhereInput[] {
  const query = rawQuery.trim()
  if (!query) return []

  return [
    { id: { equals: query } },
    { user: { email: { contains: query, mode: 'insensitive' } } },
    { user: { name: { contains: query, mode: 'insensitive' } } },
    { plan: { name: { contains: query, mode: 'insensitive' } } },
    { yookassaId: { contains: query, mode: 'insensitive' } },
    { externalPaymentId: { contains: query, mode: 'insensitive' } },
  ]
}

// Telegram-аккаунты без почты хранятся с техническим адресом @pending.invalid,
// поэтому показываем их по Telegram, как в шапке кабинета.
export function formatAdminUserLabel(user: {
  email: string
  telegramUsername: string | null
  telegramId: bigint | null
}) {
  return user.email.endsWith('@pending.invalid')
    ? `@${user.telegramUsername || user.telegramId?.toString() || 'telegram'}`
    : user.email
}

// Как в списке пользователей: действующая подписка, иначе самая поздняя.
export function pickAdminUserSubscription<T extends { status: string; expireAt: Date }>(
  subscriptions: T[],
  now = new Date(),
): T | null {
  return subscriptions.find((item) => (
    ['ACTIVE', 'LIMITED'].includes(item.status) && item.expireAt.getTime() > now.getTime()
  )) ?? subscriptions[0] ?? null
}
