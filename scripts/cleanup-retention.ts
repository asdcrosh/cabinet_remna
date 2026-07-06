import { prisma } from '../src/lib/prisma'
import { logInfo } from '../src/lib/logger'

const DAY_MS = 24 * 60 * 60 * 1000

async function main() {
  const now = new Date()
  const auditDays = readDays('AUDIT_LOG_RETENTION_DAYS', 365)
  const notificationDays = readDays('NOTIFICATION_LOG_RETENTION_DAYS', 180)
  const syncEventDays = readDays('SYNC_EVENT_RETENTION_DAYS', 180)
  const broadcastDeliveryDays = readDays('BROADCAST_DELIVERY_RETENTION_DAYS', 180)

  const [
    expiredRateLimits,
    expiredRevokedSessions,
    oldAuditLogs,
    oldNotificationLogs,
    oldSyncEvents,
    oldBroadcastDeliveries,
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
    prisma.notificationLog.deleteMany({
      where: { createdAt: { lt: daysAgo(now, notificationDays) } },
    }),
    prisma.syncEvent.deleteMany({
      where: { updatedAt: { lt: daysAgo(now, syncEventDays) } },
    }),
    prisma.broadcastDelivery.deleteMany({
      where: {
        status: { in: ['SUCCEEDED', 'FAILED'] },
        updatedAt: { lt: daysAgo(now, broadcastDeliveryDays) },
      },
    }),
  ])

  logInfo('retention.cleanup_completed', {
    expiredRateLimits: expiredRateLimits.count,
    expiredRevokedSessions: expiredRevokedSessions.count,
    oldAuditLogs: oldAuditLogs.count,
    oldNotificationLogs: oldNotificationLogs.count,
    oldSyncEvents: oldSyncEvents.count,
    oldBroadcastDeliveries: oldBroadcastDeliveries.count,
  })
}

function readDays(key: string, fallback: number) {
  const value = Number(process.env[key] ?? fallback)
  if (!Number.isFinite(value) || value < 1) return fallback
  return Math.floor(value)
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
