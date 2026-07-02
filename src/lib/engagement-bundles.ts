import type { EngagementBundleScenario, EngagementBundleSetting, Plan, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { grantEngagementBonusBoxAttempts } from './engagement-rewards'

export type EngagementBundleView = {
  key: string
  scenario: EngagementBundleScenario
  title: string
  description: string
  cta: string
  href: string
  minPlanDurationDays: number | null
  bonusAttempts: number
  bonusMultiplier: number
  promoCode: { code: string; discountPercent: number } | null
}

type BundleSeed = {
  key: string
  scenario: EngagementBundleScenario
  priority: number
  title: string
  description: string
  cta: string
  href: string
  minPlanDurationDays?: number
  bonusAttempts?: number
  bonusMultiplier?: number
}

const DEFAULT_BUNDLES: BundleSeed[] = [
  {
    key: 'EXTEND_90_BONUS',
    scenario: 'EXTEND_90_BONUS',
    priority: 10,
    title: 'Продлите на 90 дней',
    description: 'Получите 6 открытий bonus box за продление длинного тарифа.',
    cta: 'Выбрать 90 дней',
    href: '/dashboard/plans?bundle=EXTEND_90_BONUS',
    minPlanDurationDays: 90,
    bonusAttempts: 6,
  },
  {
    key: 'COMEBACK_TODAY',
    scenario: 'COMEBACK_TODAY',
    priority: 20,
    title: 'Вернитесь сегодня',
    description: 'Скидка 35% и 2 открытия bonus box для возвращения.',
    cta: 'Вернуться со скидкой',
    href: '/dashboard/plans?bundle=COMEBACK_TODAY',
    minPlanDurationDays: 30,
    bonusAttempts: 2,
  },
  {
    key: 'ACTIVE_DOUBLE_REWARD',
    scenario: 'ACTIVE_DOUBLE_REWARD',
    priority: 30,
    title: 'x2 награды за раннее продление',
    description: 'Продлите активную подписку заранее и получите удвоенные открытия.',
    cta: 'Продлить заранее',
    href: '/dashboard/plans?bundle=ACTIVE_DOUBLE_REWARD',
    minPlanDurationDays: 30,
    bonusMultiplier: 2,
  },
]

export async function ensureEngagementBundleSettings() {
  await Promise.all(
    DEFAULT_BUNDLES.map((bundle) =>
      prisma.engagementBundleSetting.upsert({
        where: { key: bundle.key },
        create: {
          key: bundle.key,
          scenario: bundle.scenario,
          priority: bundle.priority,
          title: bundle.title,
          description: bundle.description,
          cta: bundle.cta,
          href: bundle.href,
          minPlanDurationDays: bundle.minPlanDurationDays,
          bonusAttempts: bundle.bonusAttempts ?? 0,
          bonusMultiplier: bundle.bonusMultiplier ?? 1,
        },
        update: {
          scenario: bundle.scenario,
          title: bundle.title,
          description: bundle.description,
          cta: bundle.cta,
          href: bundle.href,
          minPlanDurationDays: bundle.minPlanDurationDays,
          bonusAttempts: bundle.bonusAttempts ?? 0,
          bonusMultiplier: bundle.bonusMultiplier ?? 1,
          priority: bundle.priority,
        },
      })
    )
  )
}

export async function getVisibleEngagementBundles(input: {
  userId: string
  placement: 'HOME' | 'PLANS' | 'BROADCAST' | 'PERSONAL_OFFER'
}) {
  await ensureEngagementBundleSettings()
  const [bundles, context] = await Promise.all([
    prisma.engagementBundleSetting.findMany({
      where: {
        enabled: true,
        ...(input.placement === 'HOME' ? { showOnHome: true } : {}),
        ...(input.placement === 'PLANS' ? { showOnPlans: true } : {}),
        ...(input.placement === 'BROADCAST' ? { showInBroadcasts: true } : {}),
        ...(input.placement === 'PERSONAL_OFFER' ? { showAsPersonalOffer: true } : {}),
      },
      include: { promoCode: { select: { code: true, discountPercent: true, isActive: true } } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    }),
    getUserBundleContext(input.userId),
  ])

  return bundles
    .filter((bundle) => isBundleEligible(bundle, context))
    .map(toBundleView)
}

export async function getPaymentBundleForPlan(input: {
  userId: string
  bundleKey?: string | null
  plan: Pick<Plan, 'durationDays'>
}) {
  const key = input.bundleKey?.trim()
  if (!key) return null
  await ensureEngagementBundleSettings()
  const bundle = await prisma.engagementBundleSetting.findUnique({
    where: { key },
    include: { promoCode: { select: { id: true, code: true, discountPercent: true, isActive: true } } },
  })
  if (!bundle?.enabled) {
    throw new EngagementBundleError('Bundle недоступен', 404, 'BUNDLE_NOT_FOUND')
  }
  if (bundle.minPlanDurationDays && input.plan.durationDays < bundle.minPlanDurationDays) {
    throw new EngagementBundleError(`Для этого bundle нужен тариф от ${bundle.minPlanDurationDays} дней`, 400, 'PLAN_DURATION_TOO_SHORT')
  }
  const context = await getUserBundleContext(input.userId)
  if (!isBundleEligible(bundle, context)) {
    throw new EngagementBundleError('Этот bundle сейчас недоступен для аккаунта', 403, 'BUNDLE_NOT_ELIGIBLE')
  }
  return bundle
}

export async function grantBundleRewardForPayment(input: {
  paymentId: string
  hadActiveSubscriptionBefore: boolean
}) {
  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    include: {
      engagementBundle: true,
      plan: { select: { durationDays: true } },
    },
  })
  if (!payment?.engagementBundle || payment.status !== 'SUCCEEDED' || !payment.subscriptionProvisionedAt) {
    return { granted: 0 }
  }

  const bundle = payment.engagementBundle
  let attempts = bundle.bonusAttempts
  if (bundle.scenario === 'ACTIVE_DOUBLE_REWARD') {
    if (!input.hadActiveSubscriptionBefore) return { granted: 0, reason: 'not_early' as const }
    attempts = getEarlyRenewalBaseAttempts(payment.plan.durationDays) * Math.max(1, bundle.bonusMultiplier - 1)
  }
  if (bundle.scenario === 'EXTEND_90_BONUS' && payment.plan.durationDays < 90) {
    return { granted: 0, reason: 'duration_not_eligible' as const }
  }

  return grantEngagementBonusBoxAttempts({
    userId: payment.userId,
    source: 'BUNDLE',
    sourceKeyPrefix: `${bundle.key}:${payment.id}`,
    attemptsCount: attempts,
  })
}

export function toBundleSnapshot(bundle: EngagementBundleSetting & {
  promoCode?: { code: string; discountPercent: number; isActive: boolean } | null
}) {
  return {
    key: bundle.key,
    scenario: bundle.scenario,
    title: bundle.title,
    bonusAttempts: bundle.bonusAttempts,
    bonusMultiplier: bundle.bonusMultiplier,
    minPlanDurationDays: bundle.minPlanDurationDays,
    promoCode: bundle.promoCode?.isActive
      ? { code: bundle.promoCode.code, discountPercent: bundle.promoCode.discountPercent }
      : null,
  } satisfies Prisma.InputJsonObject
}

async function getUserBundleContext(userId: string) {
  const now = new Date()
  const [activeSubscriptions, historicalSubscriptions, successfulPayments] = await Promise.all([
    prisma.subscription.count({
      where: { userId, status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gt: now } },
    }),
    prisma.subscription.count({ where: { userId } }),
    prisma.payment.count({ where: { userId, status: 'SUCCEEDED' } }),
  ])
  return {
    hasActiveSubscription: activeSubscriptions > 0,
    hasHistory: historicalSubscriptions > 0 || successfulPayments > 0,
  }
}

function isBundleEligible(
  bundle: Pick<EngagementBundleSetting, 'scenario'>,
  context: { hasActiveSubscription: boolean; hasHistory: boolean }
) {
  if (bundle.scenario === 'COMEBACK_TODAY') {
    return !context.hasActiveSubscription && context.hasHistory
  }
  if (bundle.scenario === 'ACTIVE_DOUBLE_REWARD') {
    return context.hasActiveSubscription
  }
  if (bundle.scenario === 'EXTEND_90_BONUS') {
    return context.hasActiveSubscription
  }
  return true
}

function toBundleView(bundle: EngagementBundleSetting & {
  promoCode?: { code: string; discountPercent: number; isActive: boolean } | null
}): EngagementBundleView {
  return {
    key: bundle.key,
    scenario: bundle.scenario,
    title: bundle.title,
    description: bundle.description,
    cta: bundle.cta,
    href: bundle.href ?? `/dashboard/plans?bundle=${bundle.key}`,
    minPlanDurationDays: bundle.minPlanDurationDays,
    bonusAttempts: bundle.bonusAttempts,
    bonusMultiplier: bundle.bonusMultiplier,
    promoCode: bundle.promoCode?.isActive
      ? { code: bundle.promoCode.code, discountPercent: bundle.promoCode.discountPercent }
      : null,
  }
}

function getEarlyRenewalBaseAttempts(durationDays: number) {
  if (durationDays >= 90) return 6
  if (durationDays >= 30) return 3
  return 0
}

export class EngagementBundleError extends Error {
  constructor(message: string, public status = 400, public code = 'BUNDLE_ERROR') {
    super(message)
  }
}
