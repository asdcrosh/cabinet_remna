import { redirect } from 'next/navigation'
import {
  Gift,
  TrendingUp,
  UsersRound,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { getAppUrl } from '@/lib/app-url'
import { ensureUserReferralCode } from '@/lib/referrals'
import { getReferralBonusDays } from '@/lib/referral-rewards'
import { ReferralLinkCard } from '@/components/dashboard/referral-card'
import { PageHeader } from '@/components/dashboard/page-header'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Рефералы' }

type RewardStatus = 'PENDING' | 'PROCESSING' | 'APPLIED'

export default async function ReferralsPage() {
  const session = await getCurrentUser()
  if (!session) redirect('/login')

  const bonusDays = getReferralBonusDays()
  const referralCode = await ensureUserReferralCode(session.uid)
  const appUrl = getAppUrl()
  const referralUrl = `${appUrl}/register?ref=${encodeURIComponent(referralCode)}`

  const [invitedCount, paidCount, appliedReward, pendingReward, referrals] = await Promise.all([
    prisma.user.count({ where: { referredById: session.uid } }),
    prisma.user.count({
      where: {
        referredById: session.uid,
        payments: {
          some: {
            status: 'SUCCEEDED',
            amountKopecks: { gt: 0 },
            subscriptionProvisionedAt: { not: null },
          },
        },
      },
    }),
    prisma.referralReward.aggregate({
      where: { referrerId: session.uid, status: 'APPLIED' },
      _sum: { bonusDays: true },
      _count: true,
    }),
    prisma.referralReward.aggregate({
      where: { referrerId: session.uid, status: { in: ['PENDING', 'PROCESSING'] } },
      _sum: { bonusDays: true },
      _count: true,
    }),
    prisma.user.findMany({
      where: { referredById: session.uid },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        email: true,
        name: true,
        telegramUsername: true,
        createdAt: true,
        payments: {
          where: {
            status: 'SUCCEEDED',
            amountKopecks: { gt: 0 },
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

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Рефералы" description={`+${bonusDays} дней за первую оплату друга`} />

      <section id="referral-link" className="scroll-mt-24">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem]">
          <ReferralLinkCard code={referralCode} url={referralUrl} bonusDays={bonusDays} />
          <div className="rounded-lg border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-cyan-50 p-3 shadow-sm shadow-emerald-100/50 dark:border-emerald-400/20 dark:from-emerald-400/10 dark:to-cyan-400/10 dark:shadow-none sm:p-4">
            <div className="flex items-center justify-between gap-3 lg:block">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-200">
                  <Gift className="h-4 w-4" />
                  Бонус
                </div>
                <div className="mt-2 text-2xl font-semibold text-emerald-950 dark:text-emerald-100 sm:text-3xl">+{bonusDays} дн.</div>
              </div>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/75 text-emerald-700 shadow-sm dark:bg-white/10 dark:text-emerald-200 lg:mt-5">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-sm text-emerald-700/80 dark:text-emerald-200/80">начислим после первой оплаты приглашенного</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <SummaryCard label="Приглашено" value={invitedCount} />
        <SummaryCard label="Оплатили" value={paidCount} />
        <SummaryCard label="Конверсия" value={`${conversion}%`} />
        <SummaryCard
          label="Начислено"
          value={`+${appliedDays}`}
          hint={pendingDays > 0 ? `+${pendingDays} дн. ожидают` : undefined}
        />
      </section>

      <section id="referral-history" className="scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold sm:text-xl">Приглашённые</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Кто зарегистрировался и когда начислится бонус.</p>
          </div>
          {invitedCount > 0 && <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-white/10 dark:text-slate-300">{referrals.length} из {invitedCount}</div>}
        </div>

        <div className="overflow-hidden rounded-lg border bg-white/80 shadow-sm dark:border-white/10 dark:bg-surface-900/80">
          {referrals.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                <UsersRound className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-semibold">Приглашений пока нет</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                Поделитесь ссылкой выше, и первые регистрации появятся здесь.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/10">
              {referrals.map((user) => {
                const paidAt = user.payments[0]?.paidAt ?? user.payments[0]?.createdAt ?? null
                const reward = getReferralStatus(user.referralRewardAsReferred, Boolean(paidAt))
                return (
                  <article key={user.id} className="grid gap-3 px-3 py-3 sm:px-4 md:grid-cols-[minmax(0,1fr)_8rem_8rem_10rem] md:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                          <UsersRound className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{displayReferralName(user)}</div>
                          <div className="truncate text-xs text-slate-500">{maskEmail(user.email)}</div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:contents">
                      <HistoryCell label="Регистрация" value={formatReferralDate(user.createdAt)} />
                      <HistoryCell label="Оплата" value={paidAt ? formatReferralDate(paidAt) : 'Ожидаем'} />
                    </div>
                    <div className="min-w-0 rounded-lg bg-slate-50 p-2 dark:bg-white/5 md:bg-transparent md:p-0 md:text-right md:dark:bg-transparent">
                      <span className={reward.className}>{reward.label}</span>
                      <div className="mt-1 truncate text-xs text-slate-500">{reward.description}</div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function SummaryCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border bg-white/85 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04] sm:p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-950 dark:text-white sm:text-2xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  )
}

function HistoryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 p-2 dark:bg-white/5 md:bg-transparent md:p-0 md:dark:bg-transparent">
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  )
}

function getReferralStatus(
  reward: { status: RewardStatus; bonusDays: number; appliedAt: Date | null; createdAt: Date } | null,
  hasPaid: boolean
) {
  if (reward?.status === 'APPLIED') {
    return {
      label: 'Начислен',
      description: `+${reward.bonusDays} дн.${reward.appliedAt ? ` · ${formatReferralDate(reward.appliedAt)}` : ''}`,
      className: 'badge-active',
    }
  }
  if (reward?.status === 'PROCESSING') {
    return {
      label: 'Начисляется',
      description: `+${reward.bonusDays} дн. в обработке`,
      className: 'badge-limited',
    }
  }
  if (reward?.status === 'PENDING') {
    return {
      label: 'Ожидает начисление',
      description: hasPaid ? `+${reward.bonusDays} дн. готовы` : 'После оплаты друга',
      className: 'badge-limited',
    }
  }
  if (hasPaid) {
    return {
      label: 'Оплата проверяется',
      description: 'Бонус появится после выдачи тарифа',
      className: 'badge-limited',
    }
  }
  return {
    label: 'Ожидает оплату',
    description: 'Бонус после первой покупки',
    className: 'badge-disabled',
  }
}

function displayReferralName(user: { name: string | null; telegramUsername: string | null; email: string }) {
  if (user.name) return user.name
  if (user.telegramUsername) return `@${user.telegramUsername}`
  if (isPendingTelegramEmail(user.email)) return 'Пользователь Telegram'
  return maskEmail(user.email)
}

function maskEmail(email: string) {
  if (isPendingTelegramEmail(email)) return 'Telegram Mini App'
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${(name || email).slice(0, 2)}***@${domain}`
}

function isPendingTelegramEmail(email: string) {
  return email.startsWith('telegram-') && email.includes('@pending.invalid')
}

function formatReferralDate(date: Date) {
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
  })
}
