import { prisma } from './prisma'

export type NotificationPreferences = {
  inAppEnabled: boolean
  telegramEnabled: boolean
  emailEnabled: boolean
  broadcastsEnabled: boolean
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  inAppEnabled: true,
  telegramEnabled: true,
  emailEnabled: true,
  broadcastsEnabled: true,
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const preference = await prisma.userNotificationPreference.findUnique({
    where: { userId },
    select: {
      inAppEnabled: true,
      telegramEnabled: true,
      emailEnabled: true,
      broadcastsEnabled: true,
    },
  })
  return preference ?? DEFAULT_NOTIFICATION_PREFERENCES
}

export async function updateNotificationPreferences(userId: string, preferences: NotificationPreferences) {
  return prisma.userNotificationPreference.upsert({
    where: { userId },
    create: { userId, ...preferences },
    update: preferences,
    select: {
      inAppEnabled: true,
      telegramEnabled: true,
      emailEnabled: true,
      broadcastsEnabled: true,
    },
  })
}
