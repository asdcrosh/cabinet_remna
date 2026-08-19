import type { Prisma, SubscriptionHealthAction, SubscriptionHealthStatus } from '@prisma/client'
import { gbToBytes } from './format'
import { prisma } from './prisma'
import { remnashopQuery } from './remnashop-db'
import { syncCabinetPaymentToRemnashopBestEffort } from './remnashop-reverse-sync'
import {
  hasRemnawaveUserReference,
  remnawave,
  RemnawaveError,
  remnawaveUserReference,
  type UserResponse,
} from './remnawave'
import { syncLocalDevicesFromRemnawave } from './remnawave-device-sync'
import { upsertLocalSubscriptionFromRemnawave } from './remnawave-local-sync'
import { readRemnawaveBigInt } from './remnawave-usage'
import { describeSyncError } from './sync-error'

const EXPIRY_TOLERANCE_MS = 2 * 60 * 1000

export type SubscriptionHealthIssue = {
  code: string
  severity: 'WARNING' | 'ERROR'
  source: 'CABINET' | 'REMNAWAVE' | 'REMNASHOP'
  title: string
  detail: string
  repair: 'AUTO' | 'MANUAL' | 'NONE'
}

type CheckMode = 'CHECK' | 'AUTO' | 'REPAIR'

type RemnashopSnapshot = {
  id: string | null
  status: string | null
  expireAt: string | null
  trafficLimitBytes: string | null
  deviceLimit: number | null
  remnawaveUuid: string | null
}

type LoadedUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>

export async function checkSubscriptionHealth(input: {
  userId: string
  mode?: CheckMode
  actorId?: string | null
}) {
  const mode = input.mode ?? 'CHECK'
  let state = await inspect(input.userId)
  const initialIssues = state.issues
  const changes: string[] = []
  let repairError: string | null = null

  try {
    if (mode === 'AUTO' || mode === 'REPAIR') {
      changes.push(...await applySafeRepairs(state))
    }
    if (mode === 'REPAIR') {
      changes.push(...await applyManualRepairs(state))
    }
    if (mode !== 'CHECK') state = await inspect(input.userId)
  } catch (error) {
    repairError = describeSyncError(error)
    state = await inspect(input.userId).catch(() => state)
  }

  const status = statusFromIssues(state.issues, repairError)
  const checkedAt = new Date()
  const health = await prisma.subscriptionHealth.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      subscriptionId: state.user.subscriptions[0]?.id ?? null,
      status,
      issueCount: state.issues.length,
      issues: state.issues as unknown as Prisma.InputJsonValue,
      snapshots: state.snapshots as unknown as Prisma.InputJsonValue,
      lastError: repairError,
      checkedAt,
      repairedAt: changes.length > 0 ? checkedAt : null,
    },
    update: {
      subscriptionId: state.user.subscriptions[0]?.id ?? null,
      status,
      issueCount: state.issues.length,
      issues: state.issues as unknown as Prisma.InputJsonValue,
      snapshots: state.snapshots as unknown as Prisma.InputJsonValue,
      lastError: repairError,
      checkedAt,
      ...(changes.length > 0 ? { repairedAt: checkedAt } : {}),
    },
  })

  const shouldRecord = mode === 'REPAIR' || repairError !== null || initialIssues.length > 0
  if (shouldRecord) {
    await prisma.subscriptionHealthEvent.create({
      data: {
        healthId: health.id,
        action: actionFromMode(mode),
        status,
        issues: initialIssues as unknown as Prisma.InputJsonValue,
        changes: changes as unknown as Prisma.InputJsonValue,
        error: repairError,
        actorId: input.actorId ?? null,
      },
    })
  }

  return {
    userId: input.userId,
    status,
    issues: state.issues,
    initialIssues,
    changes,
    error: repairError,
    checkedAt: checkedAt.toISOString(),
  }
}

export async function reconcileSubscriptionHealthBatch(input: {
  mode?: Exclude<CheckMode, 'REPAIR'>
  limit?: number
  actorId?: string | null
  shouldStop?: () => boolean
} = {}) {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 100)
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000)
  const users = await prisma.user.findMany({
    where: {
      role: 'USER',
      OR: [
        { remnawaveId: { not: null } },
        { remnawaveUuid: { not: null } },
        { subscriptions: { some: {} } },
      ],
      AND: [
        {
          OR: [
            { subscriptionHealth: null },
            { subscriptionHealth: { checkedAt: { lt: staleBefore } } },
          ],
        },
      ],
    },
    orderBy: [
      { subscriptionHealth: { checkedAt: 'asc' } },
      { updatedAt: 'asc' },
    ],
    take: limit,
    select: { id: true },
  })

  const result = { checked: 0, healthy: 0, warning: 0, error: 0 }
  for (const user of users) {
    if (input.shouldStop?.()) break
    try {
      const item = await checkSubscriptionHealth({
        userId: user.id,
        mode: input.mode ?? 'AUTO',
        actorId: input.actorId,
      })
      result.checked += 1
      if (item.status === 'HEALTHY') result.healthy += 1
      else if (item.status === 'WARNING') result.warning += 1
      else result.error += 1
    } catch {
      result.checked += 1
      result.error += 1
    }
  }
  return result
}

async function inspect(userId: string) {
  const user = await loadUser(userId)
  if (!user) throw new Error('Пользователь не найден')

  const issues: SubscriptionHealthIssue[] = []
  const local = user.subscriptions[0] ?? null
  let remote: UserResponse | null = null
  let remoteDevices: number | null = null
  let remnashop: RemnashopSnapshot | null = null

  if (!hasRemnawaveUserReference(user)) {
    if (local) {
      issues.push(issue('REMNAWAVE_LINK_MISSING', 'ERROR', 'REMNAWAVE', 'Нет связи с Remnawave', 'У локальной подписки нет ID, UUID или username профиля Remnawave.', 'NONE'))
    }
  } else {
    try {
      remote = (await remnawave.getUser(remnawaveUserReference(user))).response
      try {
        remoteDevices = (await remnawave.getUserDevices(remote)).response.total
      } catch (error) {
        issues.push(issue('REMNAWAVE_DEVICES_UNAVAILABLE', 'WARNING', 'REMNAWAVE', 'Не проверены устройства', describeSyncError(error), 'AUTO'))
      }
    } catch (error) {
      const missing = error instanceof RemnawaveError && error.status === 404
      issues.push(issue(
        missing ? 'REMNAWAVE_PROFILE_MISSING' : 'REMNAWAVE_UNAVAILABLE',
        'ERROR',
        'REMNAWAVE',
        missing ? 'Профиль удалён из Remnawave' : 'Remnawave не отвечает',
        describeSyncError(error),
        missing ? 'NONE' : 'AUTO'
      ))
    }
  }

  if (remote) compareCabinetAndRemnawave(user, remote, issues)

  if (process.env.REMNASHOP_DATABASE_URL && user.remnashopUserId) {
    try {
      remnashop = await getRemnashopSubscription(user.remnashopUserId)
      compareRemnashop(remote, local, remnashop, issues)
    } catch (error) {
      issues.push(issue('REMNASHOP_UNAVAILABLE', 'ERROR', 'REMNASHOP', 'Remnashop не проверен', describeSyncError(error), 'AUTO'))
    }
  } else if (process.env.REMNASHOP_DATABASE_URL && (local || remote)) {
    issues.push(issue('REMNASHOP_LINK_MISSING', 'WARNING', 'REMNASHOP', 'Нет связи с Remnashop', 'Пользователь ещё не связан с записью Remnashop.', 'AUTO'))
  }

  return {
    user,
    remote,
    remnashop,
    issues,
    snapshots: {
      cabinet: local ? {
        subscriptionId: local.id,
        status: local.status,
        expireAt: local.expireAt.toISOString(),
        trafficLimitBytes: local.trafficLimitBytes?.toString() ?? null,
        trafficUsedBytes: local.trafficUsedBytes.toString(),
        devices: user._count.devices,
      } : null,
      remnawave: remote ? {
        id: remote.id ?? null,
        uuid: remote.uuid,
        status: remote.status,
        expireAt: remote.expireAt,
        trafficLimitBytes: remote.trafficLimitBytes,
        trafficUsedBytes: remote.usedTrafficBytes,
        deviceLimit: remote.hwidDeviceLimit ?? null,
        devices: remoteDevices,
      } : null,
      remnashop,
    },
  }
}

async function loadUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscriptions: {
        orderBy: { expireAt: 'desc' },
        take: 1,
        include: { plan: true },
      },
      payments: {
        where: { status: 'SUCCEEDED', subscriptionProvisionedAt: { not: null } },
        orderBy: { paidAt: 'desc' },
        take: 1,
        select: { id: true },
      },
      _count: { select: { devices: true } },
    },
  })
}

function compareCabinetAndRemnawave(user: LoadedUser, remote: UserResponse, issues: SubscriptionHealthIssue[]) {
  const local = user.subscriptions[0]
  if (!local) {
    issues.push(issue('CABINET_SUBSCRIPTION_MISSING', 'WARNING', 'CABINET', 'Нет локальной подписки', 'Профиль есть в Remnawave, но подписка отсутствует в Cabinet.', 'AUTO'))
    return
  }
  const statusesMatch = local.status === remote.status || (local.status === 'PAUSED' && remote.status === 'DISABLED')
  if (!statusesMatch) {
    issues.push(issue('STATUS_MISMATCH', 'WARNING', 'CABINET', 'Разный статус подписки', `Cabinet: ${local.status}, Remnawave: ${remote.status}.`, 'AUTO'))
  }
  const remoteExpireAt = new Date(remote.expireAt)
  if (Math.abs(local.expireAt.getTime() - remoteExpireAt.getTime()) > EXPIRY_TOLERANCE_MS) {
    issues.push(issue('EXPIRY_MISMATCH', 'WARNING', 'CABINET', 'Не совпадает срок подписки', `Cabinet: ${formatDate(local.expireAt)}, Remnawave: ${formatDate(remoteExpireAt)}.`, 'AUTO'))
  }
  const localLimit = local.trafficLimitBytes ?? 0n
  const remoteLimit = readRemnawaveBigInt(remote, ['trafficLimitBytes', 'trafficLimit'])
  if (localLimit !== remoteLimit) {
    issues.push(issue('TRAFFIC_LIMIT_MISMATCH', 'WARNING', 'CABINET', 'Не совпадает лимит трафика', `Cabinet: ${localLimit.toString()} байт, Remnawave: ${remoteLimit.toString()} байт.`, 'AUTO'))
  }

  const plan = local.plan
  if (plan) {
    const expectedTraffic = plan.trafficLimitGb == null ? 0n : gbToBytes(plan.trafficLimitGb)
    if (expectedTraffic !== remoteLimit) {
      issues.push(issue('PLAN_TRAFFIC_MISMATCH', 'WARNING', 'REMNAWAVE', 'Тариф и Remnawave расходятся', `По тарифу лимит ${expectedTraffic.toString()} байт, в Remnawave ${remoteLimit.toString()} байт.`, 'MANUAL'))
    }
    if ((remote.hwidDeviceLimit ?? 0) !== plan.deviceLimit) {
      issues.push(issue('PLAN_DEVICE_MISMATCH', 'WARNING', 'REMNAWAVE', 'Не совпадает лимит устройств', `По тарифу: ${plan.deviceLimit}, в Remnawave: ${remote.hwidDeviceLimit ?? 0}.`, 'MANUAL'))
    }
  }
}

function compareRemnashop(
  remote: UserResponse | null,
  local: LoadedUser['subscriptions'][number] | null,
  shop: RemnashopSnapshot | null,
  issues: SubscriptionHealthIssue[]
) {
  if (!shop) {
    issues.push(issue('REMNASHOP_SUBSCRIPTION_MISSING', 'WARNING', 'REMNASHOP', 'Нет подписки в Remnashop', 'Пользователь связан, но запись подписки не найдена.', 'AUTO'))
    return
  }
  const sourceStatus = local?.status === 'PAUSED' ? 'DISABLED' : remote?.status ?? local?.status
  if (sourceStatus && shop.status && normalizeStatus(shop.status) !== sourceStatus) {
    issues.push(issue('REMNASHOP_STATUS_MISMATCH', 'WARNING', 'REMNASHOP', 'Разный статус в Remnashop', `Ожидается ${sourceStatus}, в Remnashop ${shop.status}.`, 'AUTO'))
  }
  const sourceExpireAt = remote ? new Date(remote.expireAt) : local?.expireAt
  const shopExpireAt = shop.expireAt ? new Date(shop.expireAt) : null
  if (sourceExpireAt && (!shopExpireAt || Math.abs(sourceExpireAt.getTime() - shopExpireAt.getTime()) > EXPIRY_TOLERANCE_MS)) {
    issues.push(issue('REMNASHOP_EXPIRY_MISMATCH', 'WARNING', 'REMNASHOP', 'Не совпадает срок в Remnashop', `Ожидается ${formatDate(sourceExpireAt)}, в Remnashop ${shopExpireAt ? formatDate(shopExpireAt) : 'не задан'}.`, 'AUTO'))
  }
  if (remote?.uuid && shop.remnawaveUuid && shop.remnawaveUuid !== remote.uuid) {
    issues.push(issue('REMNASHOP_UUID_MISMATCH', 'ERROR', 'REMNASHOP', 'Remnashop связан с другим профилем', `Remnawave UUID: ${remote.uuid}, в Remnashop: ${shop.remnawaveUuid}.`, 'MANUAL'))
  }
}

async function applySafeRepairs(state: Awaited<ReturnType<typeof inspect>>) {
  const changes: string[] = []
  if (state.remote) {
    await upsertLocalSubscriptionFromRemnawave({
      localUserId: state.user.id,
      planId: state.user.subscriptions[0]?.planId,
      startAt: state.user.subscriptions[0]?.startAt,
      remnawaveUser: state.remote,
    })
    changes.push('Состояние Remnawave сохранено в Cabinet')
    try {
      await syncLocalDevicesFromRemnawave({
        localUserId: state.user.id,
        reference: state.remote,
      })
      changes.push('Список устройств обновлён')
    } catch {
      // Ошибка останется отдельным пунктом после повторной проверки и не блокирует другие исправления.
    }
  }
  const paymentId = state.user.payments[0]?.id
  if (paymentId && process.env.REMNASHOP_DATABASE_URL) {
    const result = await syncCabinetPaymentToRemnashopBestEffort(paymentId)
    if (result.ok) changes.push('Подписка повторно отправлена в Remnashop')
  }
  return changes
}

async function applyManualRepairs(state: Awaited<ReturnType<typeof inspect>>) {
  const local = state.user.subscriptions[0]
  const plan = local?.plan
  if (!state.remote || !local || !plan) return []
  const updated = await remnawave.updateUser(state.remote, {
    status: local.status === 'PAUSED' ? 'DISABLED' : local.status,
    expireAt: local.expireAt.toISOString(),
    trafficLimitBytes: plan.trafficLimitGb == null ? 0 : Number(gbToBytes(plan.trafficLimitGb)),
    hwidDeviceLimit: plan.deviceLimit,
    ...(plan.activeInternalSquads.length > 0 ? { activeInternalSquads: plan.activeInternalSquads } : {}),
  })
  await upsertLocalSubscriptionFromRemnawave({
    localUserId: state.user.id,
    planId: plan.id,
    startAt: local.startAt,
    remnawaveUser: updated.response,
  })
  const changes = ['Параметры тарифа применены в Remnawave']
  const paymentId = state.user.payments[0]?.id
  if (paymentId && process.env.REMNASHOP_DATABASE_URL) {
    const result = await syncCabinetPaymentToRemnashopBestEffort(paymentId)
    if (result.ok) changes.push('Исправленная подписка отправлена в Remnashop')
  }
  return changes
}

async function getRemnashopSubscription(userId: number): Promise<RemnashopSnapshot | null> {
  const columns = await remnashopQuery<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscriptions'`
  )
  const available = new Set(columns.rows.map((row) => row.column_name))
  if (!available.has('user_id')) throw new Error('Remnashop subscriptions.user_id is missing')
  const field = (name: string, fallback = 'NULL') => available.has(name) ? `s.${name}` : fallback
  const rows = await remnashopQuery<{
    id: string | null
    status: string | null
    expire_at: Date | string | null
    traffic_limit: string | null
    device_limit: number | null
    user_remna_id: string | null
  }>(
    `SELECT ${field('id')}::text AS id,
            ${field('status')}::text AS status,
            ${field('expire_at')} AS expire_at,
            ${field('traffic_limit')}::text AS traffic_limit,
            ${field('device_limit')}::int AS device_limit,
            ${field('user_remna_id')}::text AS user_remna_id
       FROM public.subscriptions s
      WHERE s.user_id = $1
      ORDER BY ${available.has('expire_at') ? 's.expire_at' : available.has('updated_at') ? 's.updated_at' : 's.id'} DESC NULLS LAST
      LIMIT 1`,
    [userId]
  )
  const row = rows.rows[0]
  return row ? {
    id: row.id,
    status: row.status,
    expireAt: row.expire_at ? new Date(row.expire_at).toISOString() : null,
    trafficLimitBytes: row.traffic_limit,
    deviceLimit: row.device_limit,
    remnawaveUuid: row.user_remna_id,
  } : null
}

function issue(
  code: string,
  severity: SubscriptionHealthIssue['severity'],
  source: SubscriptionHealthIssue['source'],
  title: string,
  detail: string,
  repair: SubscriptionHealthIssue['repair']
): SubscriptionHealthIssue {
  return { code, severity, source, title, detail, repair }
}

export function statusFromIssues(issues: SubscriptionHealthIssue[], error: string | null): SubscriptionHealthStatus {
  if (error || issues.some((item) => item.severity === 'ERROR')) return 'ERROR'
  return issues.length > 0 ? 'WARNING' : 'HEALTHY'
}

function actionFromMode(mode: CheckMode): SubscriptionHealthAction {
  if (mode === 'REPAIR') return 'MANUAL_REPAIR'
  if (mode === 'AUTO') return 'AUTO_REPAIR'
  return 'CHECK'
}

function normalizeStatus(status: string) {
  return status.trim().toUpperCase()
}

function formatDate(value: Date) {
  return Number.isNaN(value.getTime()) ? 'некорректная дата' : value.toISOString()
}
