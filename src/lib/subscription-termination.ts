import { logInfo, logWarn } from './logger'
import { notifySubscriptionTerminated } from './notifications'
import { prisma } from './prisma'
import { remnawave, RemnawaveError } from './remnawave'
import { removeRemnashopSubscription } from './remnashop-subscription-removal'
import { markSyncFailed, markSyncSkipped, markSyncSucceeded } from './sync-events'

export type SubscriptionTerminationSource =
  | 'USER_REQUEST'
  | 'ADMIN_REQUEST'
  | 'YOOKASSA_REFUND'
  | 'PLATEGA_CHARGEBACK'
  | 'REMNASHOP_REFUND'

interface TerminateUserSubscriptionInput {
  userId: string
  source: SubscriptionTerminationSource
  paymentId?: string
  skipRemnashopSync?: boolean
}

export async function terminateUserSubscription(input: TerminateUserSubscriptionInput) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      remnawaveUuid: true,
      remnashopUserId: true,
      subscriptions: {
        where: { status: { in: ['ACTIVE', 'LIMITED'] } },
        orderBy: { expireAt: 'desc' },
        take: 1,
        select: { id: true },
      },
    },
  })
  if (!user) throw new Error('User not found')

  const hadSubscription = user.subscriptions.length > 0
  const notificationDedupeId = input.paymentId
    ? `payment:${input.paymentId}`
    : user.subscriptions[0]?.id
      ? `subscription:${user.subscriptions[0].id}`
      : user.remnawaveUuid
        ? `profile:${user.remnawaveUuid}`
        : null
  const now = new Date()
  const remnawaveUuid = user.remnawaveUuid
  if (remnawaveUuid) {
    try {
      await remnawave.updateUser({
        uuid: remnawaveUuid,
        status: 'DISABLED',
        expireAt: now.toISOString(),
      })
      await remnawave.resetTraffic(remnawaveUuid)
      const devices = await remnawave.getUserDevices(remnawaveUuid)
      await Promise.all(
        devices.response.devices.map((device) =>
          remnawave.deleteUserDevice(remnawaveUuid, device.hwid)
        )
      )
    } catch (error) {
      if (!isRemnawaveUserMissing(error)) throw error
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { userId: user.id, status: { in: ['ACTIVE', 'LIMITED'] } },
      data: {
        status: 'DISABLED',
        expireAt: now,
        trafficLimitBytes: 0n,
        trafficUsedBytes: 0n,
        pendingSync: false,
        lastSyncedAt: now,
      },
    })
    await tx.device.deleteMany({ where: { userId: user.id } })
  })

  if (
    !input.skipRemnashopSync &&
    process.env.REMNASHOP_DATABASE_URL &&
    user.remnashopUserId &&
    user.remnawaveUuid
  ) {
    const event = {
      direction: 'CABINET_TO_REMNASHOP' as const,
      entityType: 'subscription',
      entityId: user.id,
      operation: 'delete',
      metadata: {
        remnashopUserId: user.remnashopUserId,
        remnawaveUuid: user.remnawaveUuid,
      },
    }
    try {
      await removeRemnashopSubscription({
        remnashopUserId: user.remnashopUserId,
        remnawaveUuid: user.remnawaveUuid,
      })
      await markSyncSucceeded(event)
    } catch (error) {
      await markSyncFailed(event, error)
      logWarn('subscription.remnashop_removal_deferred', {
        userId: user.id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  } else if (!input.skipRemnashopSync && process.env.REMNASHOP_DATABASE_URL) {
    await markSyncSkipped({
      direction: 'CABINET_TO_REMNASHOP',
      entityType: 'subscription',
      entityId: user.id,
      operation: 'delete',
    }, 'Remnashop user or Remnawave UUID is missing')
  }

  if (notificationDedupeId && (hadSubscription || input.paymentId)) {
    try {
      await notifySubscriptionTerminated({
        userId: user.id,
        source: input.source,
        dedupeId: notificationDedupeId,
      })
    } catch (error) {
      logWarn('subscription.termination_notification_failed', {
        userId: user.id,
        source: input.source,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  logInfo('subscription.terminated', {
    userId: user.id,
    source: input.source,
    paymentId: input.paymentId,
    hadSubscription,
  })

  return { hadSubscription }
}

function isRemnawaveUserMissing(error: unknown) {
  if (!(error instanceof RemnawaveError)) return false
  if (error.status === 404) return true
  return Boolean(
    error.body &&
    typeof error.body === 'object' &&
    'errorCode' in error.body &&
    error.body.errorCode === 'A025'
  )
}
