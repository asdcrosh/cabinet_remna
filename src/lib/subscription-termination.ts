import { logInfo, logWarn } from './logger'
import { notifySubscriptionTerminated } from './notifications'
import { prisma } from './prisma'
import {
  hasRemnawaveUserReference,
  remnawave,
  RemnawaveError,
  remnawaveUserReference,
} from './remnawave'
import { removeRemnashopSubscription } from './remnashop-subscription-removal'
import { markSyncFailed, markSyncSkipped, markSyncSucceeded } from './sync-events'
import { paymentErrorDetails, recordPaymentEvent } from './payment-events'

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
  if (input.paymentId) {
    await recordPaymentEvent({
      paymentId: input.paymentId,
      stage: 'SUBSCRIPTION',
      status: 'INFO',
      source: 'subscription-termination',
      message: 'Начато отключение подписки',
      details: { source: input.source },
      dedupeKey: `termination-started-${input.source}`,
    })
  }
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      remnawaveId: true,
      remnawaveUuid: true,
      remnawaveUsername: true,
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
        : user.remnawaveId
          ? `profile:${user.remnawaveId}`
        : null
  const now = new Date()
  const reference = remnawaveUserReference(user)
  if (hasRemnawaveUserReference(user)) {
    try {
      const disabled = await remnawave.disableUser(reference)
      await runRemnawaveCleanup(user.id, 'expire', () =>
        remnawave.updateUser(disabled.response, { expireAt: now.toISOString() })
      )
      await runRemnawaveCleanup(user.id, 'traffic', () =>
        remnawave.resetTraffic(disabled.response)
      )
      await runRemnawaveCleanup(user.id, 'devices', () =>
        remnawave.deleteAllUserDevices(disabled.response)
      )
    } catch (error) {
      if (!isRemnawaveUserMissing(error)) {
        if (input.paymentId) {
          await recordPaymentEvent({
            paymentId: input.paymentId,
            stage: 'SUBSCRIPTION',
            status: 'ERROR',
            source: 'subscription-termination',
            message: 'Remnawave не отключил подписку',
            details: paymentErrorDetails(error, { source: input.source }),
            dedupeKey: `termination-failed-${input.source}`,
          })
        }
        throw error
      }
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

  if (input.paymentId) {
    await recordPaymentEvent({
      paymentId: input.paymentId,
      stage: 'SUBSCRIPTION',
      status: 'SUCCESS',
      source: 'subscription-termination',
      message: 'Подписка отключена, профиль пользователя сохранён',
      details: { source: input.source, hadSubscription },
      dedupeKey: `termination-succeeded-${input.source}`,
    })
  }

  return { hadSubscription }
}

async function runRemnawaveCleanup(
  userId: string,
  stage: 'expire' | 'traffic' | 'devices',
  cleanup: () => Promise<unknown>
) {
  try {
    await cleanup()
  } catch (error) {
    logWarn('subscription.remnawave_cleanup_deferred', {
      userId,
      stage,
      message: error instanceof Error ? error.message : String(error),
    })
  }
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
