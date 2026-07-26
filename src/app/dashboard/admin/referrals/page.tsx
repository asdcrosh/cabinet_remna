import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { getReferralSettings } from '@/lib/referral-settings'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { ReferralSettingsAdmin } from '@/components/admin/referral-settings-admin'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Реферальная программа — Админка' }

export default async function AdminReferralsPage() {
  await requireAdminPage()
  const [settings, invitedCount, rewardsCount, appliedCount] = await Promise.all([
    getReferralSettings(),
    prisma.user.count({ where: { referredById: { not: null } } }),
    prisma.referralReward.count(),
    prisma.referralReward.count({ where: { status: 'APPLIED' } }),
  ])

  return (
    <AdminPageShell
      title="Реферальная программа"
      description="Условия приглашения и награды для обеих сторон"
    >
      <ReferralSettingsAdmin
        initialSettings={settings}
        stats={{
          invited: invitedCount,
          rewards: rewardsCount,
          applied: appliedCount,
        }}
      />
    </AdminPageShell>
  )
}
