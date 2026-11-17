import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/cookies'
import { getBonusBoxOverview, retryPendingBonusBoxSyncsForUser } from '@/lib/bonus-box'
import { BonusBoxClientDynamic } from '@/components/bonus-box/bonus-box-client-dynamic'
import { PageHeader } from '@/components/dashboard/page-header'
import { getFeatureFlags } from '@/lib/feature-flags'
import { BonusSectionTabs } from '@/components/dashboard/bonus-section-tabs'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Бонусы' }

export default async function BonusBoxPage() {
  const features = await getFeatureFlags()
  if (!features.bonusBox) notFound()
  const session = await getCurrentUser()
  if (!session) redirect('/login?next=/dashboard/bonus-box')

  await retryPendingBonusBoxSyncsForUser(session.uid)
  const data = await getBonusBoxOverview(session.uid)

  const v2 = features.newDesign
  return (
    <div className="page-stack" data-design={v2 ? 'v2' : undefined}>
      <PageHeader
        title="Бонусы"
        description={v2
          ? 'Попытки начисляются за оплату, задания и приглашения. Крутите рулетку и забирайте призы.'
          : 'Получайте подарки за активность и используйте начисленные бонусы и промокоды.'}
      />
      {v2 && features.referrals ? <BonusSectionTabs active="bonuses" /> : null}
      <BonusBoxClientDynamic initialData={data} referralsEnabled={features.referrals} />
    </div>
  )
}
