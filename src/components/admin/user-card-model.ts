import { formatBytes } from '@/lib/format'

export const USER_CARD_TABS = ['subscription', 'payments', 'devices', 'support', 'history'] as const
export type UserCardTab = (typeof USER_CARD_TABS)[number]
export const DEFAULT_USER_CARD_TAB: UserCardTab = 'subscription'

const ACTIVE_SUBSCRIPTION_STATUSES = ['ACTIVE', 'LIMITED']

export function parseUserCardTab(
  value: string | string[] | undefined,
  options: { canViewHistory: boolean }
): UserCardTab {
  const raw = Array.isArray(value) ? value[0] : value
  const tab = USER_CARD_TABS.find((item) => item === raw)
  if (!tab) return DEFAULT_USER_CARD_TAB
  if (tab === 'history' && !options.canViewHistory) return DEFAULT_USER_CARD_TAB
  return tab
}

export function buildUserCardHref(userId: string, tab: UserCardTab = DEFAULT_USER_CARD_TAB) {
  const base = `/dashboard/admin/users/${encodeURIComponent(userId)}`
  return tab === DEFAULT_USER_CARD_TAB ? base : `${base}?tab=${tab}`
}

// Same rules as the users list (src/app/dashboard/admin/users/page.tsx, UserActions)
// and the audit page guard (src/app/dashboard/admin/audit/page.tsx).
export function getUserCardPermissions(input: {
  actorRole: string
  targetRole: string
  latestSubscriptionStatus: string | null
}) {
  const isSuperAdmin = input.actorRole === 'SUPER_ADMIN'
  const canManageUser = isSuperAdmin || input.targetRole !== 'SUPER_ADMIN'
  return {
    canManageUser,
    canGrantBonusAttempts: isSuperAdmin,
    canManageWhitelistAddon: isSuperAdmin,
    canManageDiscounts: isSuperAdmin,
    canViewHistory: isSuperAdmin,
    canDisableSubscription: canManageUser && Boolean(
      input.latestSubscriptionStatus && ACTIVE_SUBSCRIPTION_STATUSES.includes(input.latestSubscriptionStatus)
    ),
  }
}

export function isTechnicalAccountEmail(email: string) {
  return email.endsWith('@pending.invalid')
}

// Mirrors the account label in src/app/dashboard/layout.tsx: Telegram-only accounts
// carry a technical @pending.invalid email, so the Telegram handle is shown instead.
export function formatUserCardAccountLabel(user: {
  email: string
  telegramUsername: string | null
  telegramId: bigint | string | null
}) {
  if (!isTechnicalAccountEmail(user.email)) return user.email
  const handle = user.telegramUsername || user.telegramId?.toString()
  return handle ? `@${handle}` : user.email
}

export function findActiveSubscription<T extends { status: string; expireAt: Date }>(subscriptions: T[], now: Date) {
  return subscriptions.find((item) => (
    ACTIVE_SUBSCRIPTION_STATUSES.includes(item.status) && item.expireAt.getTime() > now.getTime()
  ))
}

export function pickCurrentSubscription<T extends { status: string; expireAt: Date }>(subscriptions: T[], now: Date) {
  return findActiveSubscription(subscriptions, now) ?? subscriptions[0]
}

export function isWhitelistAddonActive(
  subscription: { whitelistAddonActive: boolean; whitelistAddonExpireAt: Date | null } | null | undefined,
  now: Date
) {
  return Boolean(
    subscription?.whitelistAddonActive
    && subscription.whitelistAddonExpireAt
    && subscription.whitelistAddonExpireAt.getTime() > now.getTime()
  )
}

// Same precedence as src/app/dashboard/admin/whitelist-addons/page.tsx: a stored
// remainder means the add-on is paused, otherwise it is active until expireAt.
export function getWhitelistAddonState(
  subscription: {
    whitelistAddonActive: boolean
    whitelistAddonExpireAt: Date | null
    whitelistAddonRemainingSeconds: bigint | null
  },
  now: Date
): 'ACTIVE' | 'PAUSED' | 'NONE' {
  if (subscription.whitelistAddonRemainingSeconds && subscription.whitelistAddonRemainingSeconds > 0n) return 'PAUSED'
  return isWhitelistAddonActive(subscription, now) ? 'ACTIVE' : 'NONE'
}

export function hasVpnProfile(user: {
  remnawaveId: number | null
  remnawaveUuid: string | null
  remnawaveUsername: string | null
}) {
  return Boolean(user.remnawaveId || user.remnawaveUuid || user.remnawaveUsername)
}

export function formatSubscriptionDeviceLimit(subscription: {
  deviceLimit: number | null
  plan: { deviceLimit: number; unlimitedDevices: boolean } | null
}) {
  if (subscription.plan?.unlimitedDevices) return 'Без лимита'
  const limit = subscription.deviceLimit ?? subscription.plan?.deviceLimit
  return limit ? String(limit) : '—'
}

export function formatSubscriptionTraffic(used: bigint, limit: bigint | null) {
  return limit ? `${formatBytes(used)} из ${formatBytes(limit)}` : `${formatBytes(used)} · безлимит`
}

export function userCardRoleLabel(role: string) {
  const labels: Record<string, string> = {
    USER: 'Пользователь',
    MODERATOR: 'Модератор',
    ADMIN: 'Администратор',
    SUPER_ADMIN: 'Главный администратор',
  }
  return labels[role] ?? role
}

export function userCardRoleBadgeClass(role: string) {
  if (role === 'SUPER_ADMIN') return 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200'
  if (role === 'ADMIN') return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200'
  if (role === 'MODERATOR') return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
  return 'bg-slate-100 text-slate-600 dark:bg-white/[0.07] dark:text-slate-300'
}
