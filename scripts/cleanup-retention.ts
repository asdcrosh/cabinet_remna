import { prisma } from '../src/lib/prisma'
import { logInfo } from '../src/lib/logger'

const DAY_MS = 24 * 60 * 60 * 1000

async function main() {
  const now = new Date()
  const auditDays = readDays('AUDIT_LOG_RETENTION_DAYS', 365)
  const notificationDays = readDays('NOTIFICATION_LOG_RETENTION_DAYS', 180)
  const syncEventDays = readDays('SYNC_EVENT_RETENTION_DAYS', 180)
  const broadcastDeliveryDays = readDays('BROADCAST_DELIVERY_RETENTION_DAYS', 180)
  const userNotificationDays = readDays('USER_NOTIFICATION_RETENTION_DAYS', 180)
  const supportTicketDays = readDays('SUPPORT_TICKET_RETENTION_DAYS', 730)
  const expiredTokenDays = readDays('EXPIRED_TOKEN_RETENTION_DAYS', 7)
  const batchSize = readBatchSize()

  const [
    expiredRateLimits,
    expiredRevokedSessions,
    oldAuditLogs,
    oldNotificationLogs,
    oldSyncEvents,
    oldBroadcastDeliveries,
    expiredNodeProvisioningSecrets,
    expiredEmailVerificationTokens,
    expiredPasswordResetTokens,
    oldUserNotifications,
    oldClosedSupportTickets,
  ] = await Promise.all([
    prisma.rateLimitBucket.deleteMany({
      where: { resetAt: { lt: now } },
    }),
    prisma.revokedSession.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
    prisma.auditLog.deleteMany({
      where: { createdAt: { lt: daysAgo(now, auditDays) } },
    }),
    deleteInBatches(
      () => prisma.notificationLog.findMany({
        where: {
          status: { in: ['SENT', 'FAILED'] },
          createdAt: { lt: daysAgo(now, notificationDays) },
        },
        select: { id: true },
        take: batchSize,
      }),
      (ids) => prisma.notificationLog.deleteMany({ where: { id: { in: ids } } })
    ),
    deleteInBatches(
      () => prisma.syncEvent.findMany({
        where: {
          status: { in: ['SUCCEEDED', 'SKIPPED'] },
          updatedAt: { lt: daysAgo(now, syncEventDays) },
        },
        select: { id: true },
        take: batchSize,
      }),
      (ids) => prisma.syncEvent.deleteMany({ where: { id: { in: ids } } })
    ),
    deleteInBatches(
      () => prisma.broadcastDelivery.findMany({
        where: {
          status: { in: ['SUCCEEDED', 'FAILED'] },
          updatedAt: { lt: daysAgo(now, broadcastDeliveryDays) },
        },
        select: { id: true },
        take: batchSize,
      }),
      (ids) => prisma.broadcastDelivery.deleteMany({ where: { id: { in: ids } } })
    ),
    prisma.nodeProvisioningJob.updateMany({
      where: {
        credentialsExpireAt: { lt: now },
        encryptedSshPassword: { not: '' },
      },
      data: { encryptedSshPassword: '' },
    }),
    deleteInBatches(
      () => prisma.emailVerificationToken.findMany({
        where: { expiresAt: { lt: daysAgo(now, expiredTokenDays) } },
        select: { id: true },
        take: batchSize,
      }),
      (ids) => prisma.emailVerificationToken.deleteMany({ where: { id: { in: ids } } })
    ),
    deleteInBatches(
      () => prisma.passwordResetToken.findMany({
        where: { expiresAt: { lt: daysAgo(now, expiredTokenDays) } },
        select: { id: true },
        take: batchSize,
      }),
      (ids) => prisma.passwordResetToken.deleteMany({ where: { id: { in: ids } } })
    ),
    deleteInBatches(
      () => prisma.userNotification.findMany({
        where: { createdAt: { lt: daysAgo(now, userNotificationDays) } },
        select: { id: true },
        take: batchSize,
      }),
      (ids) => prisma.userNotification.deleteMany({ where: { id: { in: ids } } })
    ),
    deleteInBatches(
      () => prisma.supportTicket.findMany({
        where: {
          status: 'CLOSED',
          closedAt: { lt: daysAgo(now, supportTicketDays) },
        },
        select: { id: true },
        take: batchSize,
      }),
      (ids) => prisma.supportTicket.deleteMany({ where: { id: { in: ids } } })
    ),
  ])

  logInfo('retention.cleanup_completed', {
    expiredRateLimits: expiredRateLimits.count,
    expiredRevokedSessions: expiredRevokedSessions.count,
    oldAuditLogs: oldAuditLogs.count,
    oldNotificationLogs: oldNotificationLogs.count,
    oldSyncEvents: oldSyncEvents.count,
    oldBroadcastDeliveries: oldBroadcastDeliveries.count,
    expiredNodeProvisioningSecrets: expiredNodeProvisioningSecrets.count,
    expiredEmailVerificationTokens: expiredEmailVerificationTokens.count,
    expiredPasswordResetTokens: expiredPasswordResetTokens.count,
    oldUserNotifications: oldUserNotifications.count,
    oldClosedSupportTickets: oldClosedSupportTickets.count,
    batchSize,
  })
}

async function deleteInBatches(
  findIds: () => Promise<Array<{ id: string }>>,
  deleteIds: (ids: string[]) => Promise<{ count: number }>
) {
  let count = 0
  while (true) {
    const rows = await findIds()
    if (rows.length === 0) return { count }
    const result = await deleteIds(rows.map((row) => row.id))
    count += result.count
    if (result.count === 0) return { count }
  }
}

function readDays(key: string, fallback: number) {
  const value = Number(process.env[key] ?? fallback)
  if (!Number.isFinite(value) || value < 1) return fallback
  return Math.floor(value)
}

function readBatchSize() {
  const value = Number(process.env.RETENTION_DELETE_BATCH_SIZE ?? 1000)
  if (!Number.isFinite(value)) return 1000
  return Math.min(10_000, Math.max(100, Math.floor(value)))
}

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * DAY_MS)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
