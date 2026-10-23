import type { User } from '@prisma/client'
import { prisma } from './prisma'
import { remnawave, hasRemnawaveUserReference, remnawaveUserReference } from './remnawave'
import { syncRemnashopUserBySourceId } from './remnashop-users'
import { getAvailablePaymentProviders } from './payment-providers'
import {
  getWhitelistAddonPauseAt,
  getWhitelistAddonRemainingSeconds,
  hasWhitelistAddonEntitlement,
  WHITELIST_ADDON_DURATION_DAYS,
} from './whitelist-addon-policy'
import { mergeWhitelistSquads } from './whitelist-addon-squads'

export class BotWhitelistError extends Error {
  constructor(message: string, public status = 409) { super(message) }
}

export async function resolveBotUser(sourceUserId: number, telegramId?: string, refresh = false) {
  let user = await prisma.user.findUnique({ where: { remnashopUserId: sourceUserId } })
  if (!user || refresh) {
    const synced = await syncRemnashopUserBySourceId(sourceUserId, { forceRemnawaveSubscriptions: true })
    if (!synced.found || synced.subscriptionAction === 'failed') {
      throw new BotWhitelistError('Не удалось проверить подписку. Попробуйте позже.', 503)
    }
    user = await prisma.user.findUnique({ where: { remnashopUserId: sourceUserId } })
  }
  if (!user || (telegramId !== undefined && user.telegramId?.toString() !== telegramId)) {
    throw new BotWhitelistError('Не удалось подтвердить пользователя', 403)
  }
  return user
}

export async function getBotWhitelistOffer(user: User) {
  const now = new Date()
  const rows = await prisma.subscription.findMany({
    where: { userId: user.id }, include: { plan: true }, orderBy: { expireAt: 'desc' },
  })
  const subscription = rows.find((row) => ['ACTIVE', 'LIMITED'].includes(row.status) && row.expireAt > now)
  const plan = subscription?.plan
  const entitlement = rows.find((row) => hasWhitelistAddonEntitlement(row, now))
  const providers = (await getAvailablePaymentProviders()).filter((provider) => provider.id !== 'PAYANYWAY')
  let reason = !subscription ? 'Для покупки нужна действующая VPN-подписка.'
    : entitlement ? 'Белые списки уже оплачены. Повторная покупка не нужна.'
    : !plan?.whitelistAddonEnabled || plan.whitelistAddonPriceKopecks <= 0 || !plan.whitelistAddonInternalSquads.length
      ? 'Для этого тарифа белые списки пока не настроены.'
      : !providers.length ? 'Оплата временно недоступна.' : null
  if (!reason && hasRemnawaveUserReference(user)) {
    const remote = (await remnawave.getUser(remnawaveUserReference(user))).response
    if (!['ACTIVE', 'LIMITED'].includes(remote.status) || new Date(remote.expireAt) <= now) {
      reason = 'Для покупки нужна действующая VPN-подписка.'
    } else if (!Array.isArray(remote.activeInternalSquads)) {
      throw new BotWhitelistError('Не удалось проверить подключённые серверы.', 503)
    } else {
      const squads = new Set(remote.activeInternalSquads.map((squad) => squad.uuid))
      // Partial/manual access is also protected from an accidental duplicate sale.
      if (plan!.whitelistAddonInternalSquads.some((id) => squads.has(id))) {
        reason = 'Белые списки уже подключены.'
      }
    }
  } else if (!reason) {
    reason = 'Профиль VPN ещё не готов. Попробуйте позже.'
  }
  const pending = await prisma.payment.findFirst({
    where: { userId: user.id, purchaseType: 'WHITELIST_ADDON', status: 'SUCCEEDED', subscriptionProvisionedAt: null },
    select: { id: true },
  })
  if (pending) reason = 'Оплата получена. Подключаем белые списки, повторно платить не нужно.'
  return {
    available: !reason, reason, planId: plan?.id ?? null,
    priceKopecks: plan?.whitelistAddonPriceKopecks ?? 0,
    durationDays: WHITELIST_ADDON_DURATION_DAYS,
    providers,
    expireAt: entitlement?.whitelistAddonExpireAt?.toISOString() ?? null,
    paused: Boolean(entitlement && !entitlement.whitelistAddonActive),
  }
}

// Called AFTER the bot changes primary limits/expiry without writing squads.
// The caller holds the same user lock as payment provisioning. Cabinet remains the only
// writer of managed add-on squads, including when the bot renews or changes a plan.
export async function syncBotWhitelistSquads(user: User, input: {
  remnawaveUuid: string
  baseSquads: string[]
  planSquads: string[]
  previousBaseSquads?: string[]
  expireAt: string
  active: boolean
}) {
  if (user.remnawaveUuid !== input.remnawaveUuid) {
    throw new BotWhitelistError('Профиль VPN не соответствует пользователю', 403)
  }
  const rows = await prisma.subscription.findMany({
    where: { userId: user.id }, include: { plan: true }, orderBy: { expireAt: 'desc' },
  })
  const remote = (await remnawave.getUser({ uuid: input.remnawaveUuid })).response
  if (!Array.isArray(remote.activeInternalSquads)) throw new Error('Remnawave squads missing')
  if (new Date(remote.expireAt).getTime() !== new Date(input.expireAt).getTime()) {
    return { activeInternalSquads: remote.activeInternalSquads.map((squad) => squad.uuid), stale: true }
  }
  const now = new Date()
  const primaryActive = input.active && ['ACTIVE', 'LIMITED'].includes(remote.status) && new Date(input.expireAt) > now
  const entitlement = rows.find((row) => hasWhitelistAddonEntitlement(row, now))
  const managed = [...new Set(rows.flatMap((row) => row.whitelistAddonInternalSquads))]
  const base = input.baseSquads.filter((id) => !managed.includes(id) || input.planSquads.includes(id))
  const activeInternalSquads = mergeWhitelistSquads({
    current: remote.activeInternalSquads.map((squad) => squad.uuid),
    base,
    previousBase: input.previousBaseSquads ?? rows[0]?.plan?.activeInternalSquads ?? [],
    previousAddon: managed,
    addon: primaryActive && entitlement ? entitlement.whitelistAddonInternalSquads : [],
  })
  await remnawave.updateUser({ uuid: input.remnawaveUuid }, { activeInternalSquads })
  // Capture unused time before the primary renewal overwrites its old expiration.
  // Resume only after the main update succeeds and normal Cabinet synchronization sees it.
  if (entitlement?.whitelistAddonActive
    && (!['ACTIVE', 'LIMITED'].includes(entitlement.status) || entitlement.expireAt <= now)) {
    const pausedAt = getWhitelistAddonPauseAt(entitlement, now)
    const remaining = getWhitelistAddonRemainingSeconds(entitlement.whitelistAddonExpireAt, pausedAt)
    await prisma.subscription.update({ where: { id: entitlement.id }, data: {
      whitelistAddonActive: false, whitelistAddonExpireAt: null,
      whitelistAddonPausedAt: pausedAt, whitelistAddonRemainingSeconds: remaining,
    } })
  }
  return { activeInternalSquads }
}
