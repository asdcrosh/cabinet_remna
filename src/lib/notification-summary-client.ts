const NOTIFICATION_REQUEST_TIMEOUT_MS = 10_000
const NOTIFICATION_SUMMARY_CACHE_MS = 2_000

export type NotificationSummaryPayload<TNotification = unknown> = {
  unreadCount: number
  notifications: TNotification[]
}

type CachedSummary = {
  expiresAt: number
  value: NotificationSummaryPayload
}

const cache = new Map<string, CachedSummary>()
const pending = new Map<string, Promise<NotificationSummaryPayload | null>>()

export function fetchNotificationSummary<TNotification = unknown>(url: string) {
  const cached = cache.get(url)
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.value as NotificationSummaryPayload<TNotification>)
  }

  const currentRequest = pending.get(url)
  if (currentRequest) {
    return currentRequest as Promise<NotificationSummaryPayload<TNotification> | null>
  }

  const request = fetch(url, {
    cache: 'no-store',
    headers: { 'x-error-presentation': 'silent' },
    signal: AbortSignal.timeout(NOTIFICATION_REQUEST_TIMEOUT_MS),
  })
    .then(async (response) => {
      if (!response.ok) return null
      const data = await response.json().catch(() => null)
      const unreadCount = Number(data?.unreadCount)
      if (!Number.isFinite(unreadCount) || unreadCount < 0) return null

      const value: NotificationSummaryPayload = {
        unreadCount,
        notifications: Array.isArray(data?.notifications) ? data.notifications : [],
      }
      cache.set(url, {
        expiresAt: Date.now() + NOTIFICATION_SUMMARY_CACHE_MS,
        value,
      })
      return value
    })
    .catch(() => null)
    .finally(() => {
      pending.delete(url)
    })

  pending.set(url, request)
  return request as Promise<NotificationSummaryPayload<TNotification> | null>
}

export function resetNotificationSummaryClientForTests() {
  cache.clear()
  pending.clear()
}
