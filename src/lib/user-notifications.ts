import type { NotificationType, UserNotification } from '@prisma/client'

export type UserNotificationView = {
  id: string
  type: NotificationType
  title: string
  body: string
  actionHref: string | null
  actionLabel: string | null
  readAt: string | null
  createdAt: string
}

export function serializeUserNotification(notification: UserNotification): UserNotificationView {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    actionHref: notification.actionHref,
    actionLabel: notification.actionLabel,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  }
}
