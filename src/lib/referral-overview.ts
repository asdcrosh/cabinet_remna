// Данные страницы «Пригласить друга» — общие для веб-кабинета и приложения StealthNet.
// Вынесено без изменений логики из app/dashboard/referrals/page.tsx.
import { prisma } from '@/lib/prisma'
import { getAppUrl } from '@/lib/app-url'
import { ensureUserReferralCode } from '@/lib/referrals'
import { getEffectiveReferralSettings, type ReferralSettings } from '@/lib/referral-settings'

type RewardStatus = 'PENDING' | 'PROCESSING' | 'APPLIED'

export const REFERRALS_PAGE_SIZE = 50

export async function getReferralOverview(userId: string, page: number) {
  const settings = await getEffectiveReferralSettings()
  const referralCode = await ensureUserReferralCode(userId)
  const appUrl = getAppUrl()
  const referralUrl = `${appUrl}/register?ref=${encodeURIComponent(referralCode)}`

  const [invitedCount, paidCount, appliedReward, pendingReward, referrals] = await Promise.all([
    prisma.user.count({ where: { referredById: userId } }),
    prisma.user.count({
      where: {
        referredById: userId,
        payments: {
          some: {
            status: 'SUCCEEDED',
            amountKopecks: { gte: Math.max(1, settings.minimumPaymentKopecks) },
            subscriptionProvisionedAt: { not: null },
          },
        },
      },
    }),
    prisma.referralReward.aggregate({
      where: { referrerId: userId, status: 'APPLIED' },
      _sum: { bonusDays: true },
      _count: true,
    }),
    prisma.referralReward.aggregate({
      where: { referrerId: userId, status: { in: ['PENDING', 'PROCESSING'] } },
      _sum: { bonusDays: true },
      _count: true,
    }),
    prisma.user.findMany({
      where: { referredById: userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * REFERRALS_PAGE_SIZE,
      take: REFERRALS_PAGE_SIZE,
      select: {
        id: true,
        email: true,
        name: true,
        telegramUsername: true,
        createdAt: true,
        payments: {
          where: {
            status: 'SUCCEEDED',
            amountKopecks: { gte: Math.max(1, settings.minimumPaymentKopecks) },
            subscriptionProvisionedAt: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            paidAt: true,
            createdAt: true,
          },
          take: 1,
        },
        referralRewardAsReferred: {
          select: {
            status: true,
            bonusDays: true,
            referrerAttempts: true,
            appliedAt: true,
            createdAt: true,
          },
        },
      },
    }),
  ])

  const appliedDays = appliedReward._sum.bonusDays ?? 0
  const pendingDays = pendingReward._sum.bonusDays ?? 0
  const conversion = invitedCount > 0 ? Math.round((paidCount / invitedCount) * 100) : 0
  const pages = Math.max(1, Math.ceil(invitedCount / REFERRALS_PAGE_SIZE))

  return {
    settings,
    referralCode,
    referralUrl,
    invitedCount,
    paidCount,
    appliedDays,
    pendingDays,
    conversion,
    pages,
    referrals,
  }
}

export function referralPaidAt(user: { payments: Array<{ paidAt: Date | null; createdAt: Date }> }) {
  return user.payments[0]?.paidAt ?? user.payments[0]?.createdAt ?? null
}

export function getReferralStatus(
  reward: {
    status: RewardStatus
    bonusDays: number
    referrerAttempts: number
    appliedAt: Date | null
    createdAt: Date
  } | null,
  hasPaid: boolean,
  settings: ReferralSettings
) {
  const rewardSummary = reward
    ? formatRewardSummary(reward.bonusDays, reward.referrerAttempts)
    : formatRewardSummary(settings.referrerBonusDays, settings.referrerAttempts)
  if (reward?.status === 'APPLIED') {
    return {
      status: 'APPLIED' as const,
      label: 'Начислен',
      description: `${rewardSummary}${reward.appliedAt ? ` · ${formatReferralDate(reward.appliedAt)}` : ''}`,
      tone: 'active' as const,
    }
  }
  if (reward?.status === 'PROCESSING') {
    return {
      status: 'PROCESSING' as const,
      label: 'Начисляется',
      description: `${rewardSummary} в обработке`,
      tone: 'limited' as const,
    }
  }
  if (reward?.status === 'PENDING') {
    return {
      status: 'PENDING' as const,
      label: 'Ожидает начисление',
      description: hasPaid ? `${rewardSummary} готовы` : referralConditionText(settings),
      tone: 'limited' as const,
    }
  }
  if (hasPaid) {
    return {
      status: 'CHECKING_PAYMENT' as const,
      label: 'Оплата проверяется',
      description: 'Бонус появится после выдачи тарифа',
      tone: 'limited' as const,
    }
  }
  return {
    status: 'WAITING_PAYMENT' as const,
      label: 'Ожидает оплату',
    description: referralConditionText(settings),
    tone: 'disabled' as const,
  }
}

export function formatRewardSummary(days: number, attempts: number) {
  const parts = []
  if (days > 0) parts.push(`+${days} дн.`)
  if (attempts > 0) parts.push(`+${attempts} ${attemptWord(attempts)}`)
  return parts.join(' и ') || 'Награда'
}

function attemptWord(value: number) {
  const mod100 = value % 100
  const mod10 = value % 10
  if (mod100 >= 11 && mod100 <= 14) return 'попыток'
  if (mod10 === 1) return 'попытка'
  if (mod10 >= 2 && mod10 <= 4) return 'попытки'
  return 'попыток'
}

export function referralConditionText(settings: ReferralSettings) {
  if (settings.trigger === 'REGISTRATION') return 'Награды после регистрации по вашей ссылке'
  if (settings.minimumPaymentKopecks > 0) {
    return `Награды после первой оплаты от ${Math.floor(settings.minimumPaymentKopecks / 100)} ₽`
  }
  return 'Награды после первой оплаты приглашённого'
}

export function displayReferralName(user: { name: string | null; telegramUsername: string | null; email: string }) {
  if (user.name) return user.name
  if (user.telegramUsername) return `@${user.telegramUsername}`
  if (isPendingTelegramEmail(user.email)) return 'Пользователь Telegram'
  return maskEmail(user.email)
}

export function maskEmail(email: string) {
  if (isPendingTelegramEmail(email)) return 'Telegram Mini App'
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${(name || email).slice(0, 2)}***@${domain}`
}

export function isPendingTelegramEmail(email: string) {
  return email.startsWith('telegram-') && email.includes('@pending.invalid')
}

export function formatReferralDate(date: Date) {
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
  })
}
