import { formatPrice } from '@/lib/format'

export type CommandPaletteItem = {
  href: string
  label: string
  group: string
  keywords?: string[]
}

export type AdminSearchUserResult = {
  id: string
  label: string
  email: string
  name: string | null
  telegramUsername: string | null
  planName: string | null
  subscriptionStatus: string | null
  expireAt: string | null
}

export type AdminSearchPaymentResult = {
  id: string
  amountKopecks: number
  status: string
  provider: string
  createdAt: string
  userId: string
  userLabel: string
  planName: string
}

export type AdminSearchResults = {
  users: AdminSearchUserResult[]
  payments: AdminSearchPaymentResult[]
}

export type CommandPaletteOptionKind = 'user' | 'payment' | 'item'

export type CommandPaletteOption = {
  key: string
  kind: CommandPaletteOptionKind
  href: string
  label: string
  description: string | null
}

export type CommandPaletteGroup = {
  key: string
  label: string
  options: CommandPaletteOption[]
}

export const COMMAND_PALETTE_MIN_QUERY_LENGTH = 2
export const COMMAND_PALETTE_MAX_QUERY_LENGTH = 100
export const COMMAND_PALETTE_USERS_GROUP = 'Клиенты'
export const COMMAND_PALETTE_PAYMENTS_GROUP = 'Платежи'

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  SUCCEEDED: 'Оплачен',
  PENDING: 'Ожидает',
  CANCELED: 'Отменён',
  REFUNDED: 'Возврат',
}

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Активна',
  LIMITED: 'Лимит',
  EXPIRED: 'Истекла',
  DISABLED: 'Отключена',
  PAUSED: 'На паузе',
}

const PAYMENT_PROVIDER_LABELS: Record<string, string> = {
  YOOKASSA: 'ЮKassa',
  PAYANYWAY: 'PayAnyWay',
  PLATEGA: 'Platega',
  LOCAL: 'Без оплаты',
}

export function normalizeSearchText(value: string) {
  return value
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
}

export function shouldSearchRemotely(query: string, canSearch: boolean) {
  const length = query.trim().length
  return canSearch && length >= COMMAND_PALETTE_MIN_QUERY_LENGTH && length <= COMMAND_PALETTE_MAX_QUERY_LENGTH
}

// Все слова запроса должны встретиться в названии или ключевых словах.
// Совпадения с началом названия поднимаются выше, остальной порядок сохраняется.
export function filterCommandItems(items: CommandPaletteItem[], query: string) {
  const normalized = normalizeSearchText(query)
  if (!normalized) return items

  const tokens = normalized.split(' ')
  return items
    .map((item, index) => {
      const label = normalizeSearchText(item.label)
      const haystack = [label, ...(item.keywords ?? []).map(normalizeSearchText)].join(' ')
      if (!tokens.every((token) => haystack.includes(token))) return null
      const rank = label.startsWith(normalized) ? 0 : label.includes(normalized) ? 1 : 2
      return { item, index, rank }
    })
    .filter((entry): entry is { item: CommandPaletteItem; index: number; rank: number } => entry !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item)
}

export function groupCommandItems(items: CommandPaletteItem[]): CommandPaletteGroup[] {
  const groups = new Map<string, CommandPaletteGroup>()
  for (const item of items) {
    let group = groups.get(item.group)
    if (!group) {
      group = { key: `items:${item.group}`, label: item.group, options: [] }
      groups.set(item.group, group)
    }
    group.options.push({
      key: `item:${item.group}:${item.href}`,
      kind: 'item',
      href: item.href,
      label: item.label,
      description: null,
    })
  }
  return Array.from(groups.values())
}

export function buildUserOption(user: AdminSearchUserResult): CommandPaletteOption {
  const subscription = user.subscriptionStatus
    ? [
        user.planName,
        SUBSCRIPTION_STATUS_LABELS[user.subscriptionStatus] ?? user.subscriptionStatus,
        user.expireAt ? `до ${formatShortDate(user.expireAt)}` : null,
      ].filter(Boolean).join(' ')
    : 'Без подписки'
  const telegram = user.telegramUsername && user.label !== `@${user.telegramUsername}`
    ? `@${user.telegramUsername}`
    : null

  return {
    key: `user:${user.id}`,
    kind: 'user',
    href: `/dashboard/admin/users/${encodeURIComponent(user.id)}`,
    label: user.label,
    description: [user.name, telegram, subscription].filter(Boolean).join(' · '),
  }
}

export function buildPaymentOption(payment: AdminSearchPaymentResult): CommandPaletteOption {
  return {
    key: `payment:${payment.id}`,
    kind: 'payment',
    href: `/dashboard/admin/payments?q=${encodeURIComponent(payment.id)}`,
    label: `${formatPrice(payment.amountKopecks)} · ${payment.planName}`,
    description: [
      payment.userLabel,
      PAYMENT_STATUS_LABELS[payment.status] ?? payment.status,
      PAYMENT_PROVIDER_LABELS[payment.provider] ?? payment.provider,
      formatShortDate(payment.createdAt),
    ].filter(Boolean).join(' · '),
  }
}

// Порядок групп: клиенты, платежи, затем разделы из навигации.
export function buildCommandPaletteGroups({
  items,
  query,
  results,
}: {
  items: CommandPaletteItem[]
  query: string
  results?: AdminSearchResults | null
}): CommandPaletteGroup[] {
  const groups: CommandPaletteGroup[] = []
  if (results?.users.length) {
    groups.push({ key: 'users', label: COMMAND_PALETTE_USERS_GROUP, options: results.users.map(buildUserOption) })
  }
  if (results?.payments.length) {
    groups.push({ key: 'payments', label: COMMAND_PALETTE_PAYMENTS_GROUP, options: results.payments.map(buildPaymentOption) })
  }
  return [...groups, ...groupCommandItems(filterCommandItems(items, query))]
}

export function flattenCommandPaletteOptions(groups: CommandPaletteGroup[]) {
  return groups.flatMap((group) => group.options)
}

// ↑/↓ ходят по кругу; -1 означает, что выбирать нечего.
export function moveActiveIndex(current: number, delta: number, count: number) {
  if (count <= 0) return -1
  if (current < 0 || current >= count) return delta < 0 ? count - 1 : 0
  return (((current + delta) % count) + count) % count
}

export function isCommandPaletteShortcut(event: {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  // code учитывает русскую раскладку, где ⌘K приходит как «л».
  return event.code === 'KeyK' || event.key.toLowerCase() === 'k'
}

type EditableCandidate = {
  tagName?: string
  isContentEditable?: boolean
}

export function isEditableTarget(target: unknown) {
  if (!target || typeof target !== 'object') return false
  const element = target as EditableCandidate
  if (element.isContentEditable) return true
  const tag = element.tagName?.toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA'
}

export function parseAdminSearchResults(value: unknown): AdminSearchResults | null {
  if (!value || typeof value !== 'object') return null
  const { users, payments } = value as { users?: unknown; payments?: unknown }
  if (!Array.isArray(users) || !Array.isArray(payments)) return null
  return {
    users: users.filter(isUserResult),
    payments: payments.filter(isPaymentResult),
  }
}

function isUserResult(value: unknown): value is AdminSearchUserResult {
  if (!value || typeof value !== 'object') return false
  const user = value as Partial<AdminSearchUserResult>
  return typeof user.id === 'string' && typeof user.label === 'string'
}

function isPaymentResult(value: unknown): value is AdminSearchPaymentResult {
  if (!value || typeof value !== 'object') return false
  const payment = value as Partial<AdminSearchPaymentResult>
  return typeof payment.id === 'string'
    && typeof payment.amountKopecks === 'number'
    && typeof payment.planName === 'string'
}

function formatShortDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}
