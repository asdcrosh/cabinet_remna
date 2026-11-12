import { prisma } from '@/lib/prisma'
import { getFeatureFlags } from '@/lib/feature-flags'
import { remnawave } from '@/lib/remnawave'
import { resolveSubscriptionPresentation } from '@/lib/subscription-presentation'
import { buildPlanCatalog } from '@/lib/plan-catalog'
import type { MiniAppOverview } from './model'
import { AuthError } from '@/lib/auth/guard'
import { starsEnabled, starsRateKopecks } from './stars'

export async function getMiniAppOverview(userId: string): Promise<MiniAppOverview> {
  const [user, features, catalog] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: {
      subscriptions: { orderBy: { expireAt: 'desc' }, take: 1, include: { plan: true } },
      _count: { select: { devices: true } },
    } }), getFeatureFlags(), buildPlanCatalog({ userId }),
  ])
  if (!user) throw new AuthError(401, 'Войдите заново')
  const local = user.subscriptions[0]
  let remote: Awaited<ReturnType<typeof remnawave.getSubscriptionByUsername>>['response']['user'] | undefined
  let warning: string | null = null
  if (user.remnawaveUsername) {
    try { remote = (await remnawave.getSubscriptionByUsername(user.remnawaveUsername)).response.user }
    catch { warning = 'Не удалось обновить данные VPN. Показаны последние сохранённые сведения.' }
  }
  const presentation = local || remote ? resolveSubscriptionPresentation({
    localStatus: local?.status, remoteStatus: remote?.userStatus,
    localExpireAt: local?.expireAt, remoteExpireAt: remote?.expiresAt ? new Date(remote.expiresAt) : null,
    remoteDaysLeft: remote?.daysLeft, graceExpireAt: local?.graceExpireAt,
    unlimitedDuration: local?.plan?.unlimitedDuration, pendingSync: local?.pendingSync, remoteUnavailable: Boolean(warning),
  }) : null
  return {
    name: user.name?.split(' ')[0] || user.telegramUsername || 'друг',
    subscription: presentation ? { title: presentation.title, description: presentation.description,
      usable: presentation.usable, daysLeft: presentation.daysLeft, expiresAt: presentation.expireAt?.toISOString() ?? null,
      planName: local?.plan?.name || 'AlekseevVP', deviceLimit: local?.plan?.unlimitedDevices ? null : local?.deviceLimit ?? local?.plan?.deviceLimit ?? null,
      pending: Boolean(local?.pendingSync) } : null,
    deviceCount: user._count.devices, support: features.support, referrals: features.referrals,
    starsEnabled: starsEnabled(), starsRateKopecks: starsEnabled() ? starsRateKopecks() : null, warning,
    plans: catalog.plans.map(plan => ({ id: plan.id, name: plan.name, description: plan.description,
        days: plan.durationDays, unlimited: plan.unlimitedDuration, trafficLimitGb: plan.trafficLimitGb,
        devices: plan.deviceLimit, unlimitedDevices: plan.unlimitedDevices,
        maxDevices: plan.deviceAddonEnabled ? plan.maxDeviceLimit : plan.initialDeviceLimit,
        initialDevices: plan.initialDeviceLimit, deviceAddonEnabled: plan.deviceAddonEnabled,
        extraDevicePriceKopecks: plan.extraDevicePriceKopecks, priceKopecks: plan.priceKopecks,
        isPromo: plan.isPromo, current: plan.current, isPlanSwitch: plan.isPlanSwitch,
        currentPlanName: plan.currentPlanName })),
  }
}
