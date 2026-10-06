import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/cookies'
import { getBonusBoxOverview, retryPendingBonusBoxSyncsForUser } from '@/lib/bonus-box'
import { BonusBoxClientDynamic } from '@/components/bonus-box/bonus-box-client-dynamic'
import { PageHeader } from '@/components/dashboard/page-header'
import { getFeatureFlags } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Бонусы' }

export default async function BonusBoxPage() {
  const features = await getFeatureFlags()
  if (!features.bonusBox) notFound()
  const session = await getCurrentUser()
  if (!session) redirect('/login?next=/dashboard/bonus-box')

  await retryPendingBonusBoxSyncsForUser(session.uid)
  const data = await getBonusBoxOverview(session.uid)

  return (
    <div className="page-stack">
      <PageHeader
        title="Бонусы"
        description="Получайте подарки за активность и используйте начисленные бонусы и промокоды."
      />
      <BonusBoxClientDynamic initialData={data} referralsEnabled={features.referrals} />
    </div>
  )
}
