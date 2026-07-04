import type { Prisma, SyncDirection, SyncEventStatus } from '@prisma/client'
import { prisma } from './prisma'
import { logWarn } from './logger'

export type SyncEventInput = {
  direction: SyncDirection
  entityType: string
  entityId: string
  operation: string
  metadata?: Prisma.InputJsonValue
}

export async function markSyncSucceeded(input: SyncEventInput) {
  await upsertSyncEvent(input, {
    status: 'SUCCEEDED',
    lastError: null,
    nextRetryAt: null,
    lastSyncedAt: new Date(),
  })
}

export async function markSyncSkipped(input: SyncEventInput, reason: string) {
  await upsertSyncEvent(input, {
    status: 'SKIPPED',
    lastError: reason.slice(0, 1000),
    nextRetryAt: null,
  })
}

export async function markSyncFailed(input: SyncEventInput, error: unknown) {
  if (!prisma.syncEvent) return
  const message = error instanceof Error ? error.message : String(error || 'unknown sync error')
  await prisma.syncEvent.upsert({
    where: uniqueWhere(input),
    create: {
      ...input,
      status: 'FAILED',
      attempts: 1,
      lastError: message.slice(0, 1000),
      nextRetryAt: computeNextRetryAt(1),
    },
    update: {
      status: 'FAILED',
      attempts: { increment: 1 },
      lastError: message.slice(0, 1000),
      nextRetryAt: computeNextRetryAtExpression(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
  }).catch((eventError) => {
    logWarn('sync_event.record_failed', {
      entityType: input.entityType,
      entityId: input.entityId,
      message: eventError instanceof Error ? eventError.message : 'unknown error',
    })
  })
}

export async function markSyncPending(input: SyncEventInput) {
  await upsertSyncEvent(input, {
    status: 'PENDING',
    lastError: null,
    nextRetryAt: new Date(),
  })
}

async function upsertSyncEvent(
  input: SyncEventInput,
  data: Pick<Prisma.SyncEventUncheckedUpdateInput, 'status' | 'lastError' | 'nextRetryAt' | 'lastSyncedAt'>
) {
  if (!prisma.syncEvent) return
  await prisma.syncEvent.upsert({
    where: uniqueWhere(input),
    create: {
      ...input,
      status: data.status as SyncEventStatus,
      lastError: data.lastError as string | null,
      nextRetryAt: data.nextRetryAt as Date | null,
      lastSyncedAt: data.lastSyncedAt as Date | null | undefined,
    },
    update: {
      ...data,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
  }).catch((error) => {
    logWarn('sync_event.record_failed', {
      entityType: input.entityType,
      entityId: input.entityId,
      message: error instanceof Error ? error.message : 'unknown error',
    })
  })
}

function uniqueWhere(input: SyncEventInput) {
  return {
    direction_entityType_entityId_operation: {
      direction: input.direction,
      entityType: input.entityType,
      entityId: input.entityId,
      operation: input.operation,
    },
  }
}

function computeNextRetryAt(attempts: number) {
  const delayMinutes = Math.min(120, Math.max(1, 2 ** Math.min(attempts, 6)))
  return new Date(Date.now() + delayMinutes * 60 * 1000)
}

function computeNextRetryAtExpression() {
  return computeNextRetryAt(2)
}
