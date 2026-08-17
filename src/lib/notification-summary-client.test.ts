import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchNotificationSummary,
  resetNotificationSummaryClientForTests,
} from './notification-summary-client'

describe('notification summary client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetNotificationSummaryClientForTests()
  })

  it('deduplicates simultaneous background requests and hides them from the error dialog', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      unreadCount: 3,
      notifications: [{ id: 'notification-1' }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const [first, second] = await Promise.all([
      fetchNotificationSummary('/api/notifications/summary'),
      fetchNotificationSummary('/api/notifications/summary'),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/notifications/summary', expect.objectContaining({
      headers: { 'x-error-presentation': 'silent' },
    }))
    expect(first).toEqual(second)
    expect(first?.unreadCount).toBe(3)
  })

  it('quietly keeps the last interface state when polling times out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('signal timed out', 'TimeoutError')))

    await expect(fetchNotificationSummary('/api/notifications/summary')).resolves.toBeNull()
  })
})
