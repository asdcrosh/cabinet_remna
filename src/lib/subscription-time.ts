import type { UserStatus } from '@/lib/remnawave'

type SubscriptionTimeStatus = UserStatus | 'PAUSED'

export function isSubscriptionExpired(daysLeft: number, status?: SubscriptionTimeStatus | null) {
  return status === 'EXPIRED' || daysLeft < 0
}

export function formatSubscriptionDaysLeft(daysLeft: number, status?: SubscriptionTimeStatus | null) {
  if (isSubscriptionExpired(daysLeft, status)) return 'Истекла'
  if (daysLeft === 0) return 'Менее дня'
  return `${daysLeft} дн.`
}
