import type { UserStatus } from '@/lib/remnawave'

export function isSubscriptionExpired(daysLeft: number, status?: UserStatus | null) {
  return status === 'EXPIRED' || daysLeft < 0
}

export function formatSubscriptionDaysLeft(daysLeft: number, status?: UserStatus | null) {
  if (isSubscriptionExpired(daysLeft, status)) return 'Истекла'
  if (daysLeft === 0) return 'Менее дня'
  return `${daysLeft} дн.`
}
