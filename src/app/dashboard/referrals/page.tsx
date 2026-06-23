import { UsersRound, CreditCard, UserPlus } from 'lucide-react'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { getAppUrl } from '@/lib/app-url'
import { ensureUserReferralCode } from '@/lib/referrals'
import { PageHeader } from '@/components/dashboard/page-header'
import { StatCard } from '@/components/dashboard/stat-card'
import { ReferralLinkCard } from '@/components/dashboard/referral-card'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Рефералы' }

export default async function ReferralsPage() {
  const session = await getCurrentUser()
  if (!session) redirect('/login')

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
            subscriptionProvisionedAt: { not: null },
          },
        },
      },
    }),
    prisma.referralReward.aggregate({
      where: { referrerId: session.uid, status: 'APPLIED' },
      _sum: { bonusDays: true },
    }),
    prisma.referralReward.aggregate({
      where: { referrerId: session.uid, status: { in: ['PENDING', 'PROCESSING'] } },
      _sum: { bonusDays: true },
    }),
    prisma.user.findMany({
      where: { referredById: session.uid },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        email: true,
        createdAt: true,
        payments: {
          where: {
            status: 'SUCCEEDED',
            subscriptionProvisionedAt: { not: null },
          },
          select: { id: true },
          take: 1,
        },
        referralRewardAsReferred: {
          select: {
            status: true,
            bonusDays: true,
          },
        },
      },
    }),
  ])

  const appliedDays = appliedReward._sum.bonusDays ?? 0
  const pendingDays = pendingReward._sum.bonusDays ?? 0

  return (
    <div className="space-y-6">
      <PageHeader title="Рефералы" description="Приглашайте пользователей и отслеживайте регистрации" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Код" value={referralCode} hint="Используется в ссылке" icon={<UserPlus className="h-5 w-5" />} />
        <StatCard label="Приглашено" value={invitedCount} hint="Регистрации по ссылке" icon={<UsersRound className="h-5 w-5" />} />
        <StatCard label="Оплатили" value={paidCount} hint="Есть выданная подписка" icon={<CreditCard className="h-5 w-5" />} />
        <StatCard
          label="Бонус"
          value={`+${appliedDays} дн.`}
          hint={pendingDays > 0 ? `Ожидает +${pendingDays} дн.` : 'Начислено за оплаты'}
          icon={<CreditCard className="h-5 w-5" />}
        />
      </div>

      <ReferralLinkCard code={referralCode} url={referralUrl} />

      <div className="card">
        <h2 className="text-lg font-semibold">Последние приглашения</h2>
        <div className="mt-4 divide-y divide-slate-100 dark:divide-white/10">
          {referrals.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">Пока нет регистраций по вашей ссылке.</div>
          )}
          {referrals.map((user) => (
            <div key={user.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate font-medium">{maskEmail(user.email)}</div>
                <div className="text-xs text-slate-500">{user.createdAt.toLocaleDateString('ru-RU')}</div>
              </div>
              <span className={getReferralBadgeClass(user.referralRewardAsReferred?.status, user.payments.length > 0)}>
                {getReferralBadgeText(user.referralRewardAsReferred, user.payments.length > 0)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function getReferralBadgeText(
  reward: { status: 'PENDING' | 'PROCESSING' | 'APPLIED'; bonusDays: number } | null,
  hasPaid: boolean
) {
  if (reward?.status === 'APPLIED') return `+${reward.bonusDays} дн.`
  if (reward?.status === 'PENDING' || reward?.status === 'PROCESSING') return `Ждет +${reward.bonusDays} дн.`
  return hasPaid ? 'Оплатил' : 'Регистрация'
}

function getReferralBadgeClass(status: 'PENDING' | 'PROCESSING' | 'APPLIED' | undefined, hasPaid: boolean) {
  if (status === 'APPLIED') return 'badge-active'
  if (status === 'PENDING' || status === 'PROCESSING') return 'badge-limited'
  return hasPaid ? 'badge-active' : 'badge-disabled'
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${name.slice(0, 2)}***@${domain}`
}
