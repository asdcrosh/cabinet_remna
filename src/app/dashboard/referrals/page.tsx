import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowRight,
  Award,
  Clock3,
  CreditCard,
  Gift,
  Link2,
  Sparkles,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { getAppUrl } from '@/lib/app-url'
import { ensureUserReferralCode } from '@/lib/referrals'
import { getReferralBonusDays } from '@/lib/referral-rewards'
import { cn } from '@/lib/cn'
import { ReferralLinkCard } from '@/components/dashboard/referral-card'

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
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-slate-900 bg-slate-950 text-white shadow-xl shadow-slate-200/60 dark:border-white/10 dark:shadow-black/30">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="relative min-w-0 p-5 sm:p-7">
            <div className="absolute inset-x-0 top-0 h-1 bg-cyan-400" />
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-sm font-medium text-cyan-100">
                <Sparkles className="h-4 w-4" />
                Реферальная программа
              </span>
              <span className="inline-flex rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-sm font-medium text-emerald-100">
                +{bonusDays} дн. за оплату друга
              </span>
            </div>

            <div className="mt-7 max-w-3xl">
              <h1 className="text-3xl font-semibold sm:text-5xl">Пригласи друга и получи +{bonusDays} дней</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Отправьте ссылку. Друг регистрируется, покупает любой платный тариф, а бонусные дни добавляются к вашей активной подписке.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="#referral-link" className="btn-primary bg-white text-slate-950 hover:bg-slate-100">
                Поделиться ссылкой
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="#referral-history" className="btn-secondary border-white/15 bg-white/10 text-white shadow-none hover:bg-white/15">
                История приглашений
              </Link>
            </div>
          </div>

          <div className="border-t border-white/10 bg-white/[0.04] p-5 sm:p-7 lg:border-l lg:border-t-0">
            <div className="grid gap-3">
              <HeroMetric icon={<UsersRound className="h-5 w-5" />} label="Приглашено" value={invitedCount} />
              <HeroMetric icon={<CreditCard className="h-5 w-5" />} label="Оплатили" value={paidCount} />
              <HeroMetric icon={<Award className="h-5 w-5" />} label="Начислено" value={`+${appliedDays} дн.`} />
              <HeroMetric icon={<Clock3 className="h-5 w-5" />} label="В ожидании" value={`+${pendingDays} дн.`} muted={pendingDays === 0} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <StepCard
          icon={<Link2 className="h-5 w-5" />}
          title="1. Поделиться"
          text="Отправьте личную ссылку другу в Telegram, чат или письмо."
        />
        <StepCard
          icon={<UserPlus className="h-5 w-5" />}
          title="2. Регистрация"
          text="Друг создаёт аккаунт по вашей ссылке, и появится в истории."
        />
        <StepCard
          icon={<Gift className="h-5 w-5" />}
          title="3. Бонус"
          text={`После первой платной покупки вы получаете +${bonusDays} дн. подписки.`}
        />
      </section>

      <section id="referral-link" className="space-y-3 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Ссылка для приглашения</h2>
            <p className="mt-1 text-sm text-slate-500">Одна ссылка для всех приглашений, бонусы считаются автоматически.</p>
          </div>
          <div className="badge-active">Бонус +{bonusDays} дн.</div>
        </div>
        <ReferralLinkCard code={referralCode} url={referralUrl} bonusDays={bonusDays} />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Всего приглашений" value={invitedCount} hint="Регистрации по ссылке" />
        <SummaryCard label="Оплатили" value={paidCount} hint="Платная покупка с выдачей" />
        <SummaryCard label="Конверсия" value={`${conversion}%`} hint="Из регистрации в покупку" />
        <SummaryCard
          label="Бонусные дни"
          value={`+${appliedDays}`}
          hint={pendingDays > 0 ? `Ещё +${pendingDays} дн. ожидают` : 'Все доступные начислены'}
        />
      </section>

      <section id="referral-history" className="scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">История приглашённых</h2>
            <p className="mt-1 text-sm text-slate-500">Статус показывает, что происходит с бонусом за каждого друга.</p>
          </div>
          <div className="text-sm text-slate-500">Последние {referrals.length} из {invitedCount}</div>
        </div>

        <div className="overflow-hidden rounded-lg border border-white/70 bg-white/80 shadow-xl shadow-slate-200/50 backdrop-blur dark:border-white/10 dark:bg-surface-900/80 dark:shadow-black/25">
          {referrals.length === 0 ? (
            <div className="px-4 py-12 text-center">
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
                  <article key={user.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_10rem_11rem_12rem] md:items-center">
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
                    <HistoryCell label="Регистрация" value={formatReferralDate(user.createdAt)} />
                    <HistoryCell label="Оплата" value={paidAt ? formatReferralDate(paidAt) : 'Ожидаем'} />
                    <div className="min-w-0 md:text-right">
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

function HeroMetric({
  icon,
  label,
  value,
  muted,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  muted?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/10 px-4 py-3', muted && 'opacity-70')}>
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-cyan-100">{icon}</div>
        <div className="text-sm text-slate-300">{label}</div>
      </div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  )
}

function StepCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-surface-900/80">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-cyan-200">
        {icon}
      </div>
      <div className="mt-4 font-semibold">{title}</div>
      <p className="mt-1 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  )
}

function SummaryCard({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return (
    <div className="rounded-lg border bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-surface-900/80">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{hint}</div>
    </div>
  )
}

function HistoryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
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
  return `${name.slice(0, 2)}***@${domain}`
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
