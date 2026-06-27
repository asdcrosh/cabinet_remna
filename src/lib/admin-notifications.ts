import { Prisma, type AdminNotification } from '@prisma/client'
import { prisma } from './prisma'

export type AdminNotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'

export type AdminNotificationView = {
  id: string
  type: string
  severity: string
  title: string
  body: string
  entityType: string | null
  entityId: string | null
  actionHref: string | null
  actionLabel: string | null
  readAt: string | null
  createdAt: string
}

export async function createAdminNotification(input: {
  type: string
  severity?: AdminNotificationSeverity
  dedupeKey?: string
  title: string
  body: string
  entityType?: string
  entityId?: string
  actionHref?: string
  actionLabel?: string
}) {
  try {
    return await prisma.adminNotification.create({
      data: {
        type: input.type,
        severity: input.severity ?? 'INFO',
        dedupeKey: input.dedupeKey,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
        actionHref: input.actionHref,
        actionLabel: input.actionLabel,
      },
    })
  } catch (error) {
    if (isUniqueError(error)) return null
    throw error
  }
}

export function serializeAdminNotification(
  notification: AdminNotification & { reads?: { readAt: Date }[] }
): AdminNotificationView {
  return {
    id: notification.id,
    type: notification.type,
    severity: notification.severity,
    title: notification.title,
    body: notification.body,
    entityType: notification.entityType,
    entityId: notification.entityId,
    actionHref: notification.actionHref,
    actionLabel: notification.actionLabel,
    readAt: notification.reads?.[0]?.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  }
}

export async function markAdminNotificationRead(notificationId: string, userId: string) {
  await prisma.adminNotificationRead.upsert({
    where: { notificationId_userId: { notificationId, userId } },
    create: { notificationId, userId },
    update: {},
  })
}

function isUniqueError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}
