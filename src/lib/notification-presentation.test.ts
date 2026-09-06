import { describe, expect, it } from 'vitest'
import type { UserNotificationView } from './user-notifications'
import { groupNotifications, notificationGroup, notificationPriority } from './notification-presentation'

function notification(overrides: Partial<UserNotificationView> = {}): UserNotificationView {
  return {
    id: 'notification-1',
    type: 'PAYMENT_FAILED',
    title: 'Платёж не прошёл',
    body: 'Выберите другой способ оплаты.',
    actionHref: '/dashboard/plans',
    actionLabel: 'Повторить',
    readAt: null,
    createdAt: '2026-09-07T10:00:00.000Z',
    ...overrides,
  }
}

describe('notification presentation', () => {
  it('объединяет одинаковые события и сохраняет все непрочитанные id', () => {
    const grouped = groupNotifications([
      notification(),
      notification({ id: 'notification-2', readAt: '2026-09-07T11:00:00.000Z' }),
      notification({ id: 'notification-3' }),
    ])

    expect(grouped).toHaveLength(1)
    expect(grouped[0]).toMatchObject({
      ids: ['notification-1', 'notification-2', 'notification-3'],
      count: 3,
      unreadCount: 2,
    })
  })

  it('разделяет события по важности и теме', () => {
    expect(notificationPriority('PAYMENT_FAILED')).toBe('action')
    expect(notificationPriority('SUPPORT_REPLY')).toBe('attention')
    expect(notificationPriority('BONUS_GRANTED')).toBe('updates')
    expect(notificationGroup('SUBSCRIPTION_PAUSED')).toBe('subscription')
    expect(notificationGroup('SUPPORT_REPLY')).toBe('support')
  })
})
