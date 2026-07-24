import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/cookies'
import { getBonusBoxOverview, retryPendingBonusBoxSyncsForUser } from '@/lib/bonus-box'
import { BonusBoxClientDynamic } from '@/components/bonus-box/bonus-box-client-dynamic'
import { PageHeader } from '@/components/dashboard/page-header'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Бонусы' }

export default async function BonusBoxPage() {
  if (!await isFeatureEnabled('bonusBox')) notFound()
  const session = await getCurrentUser()
  if (!session) redirect('/login?next=/dashboard/bonus-box')

  await retryPendingBonusBoxSyncsForUser(session.uid)
  const data = await getBonusBoxOverview(session.uid)

  return (
    <div className="page-stack">
      <PageHeader
        title="Бонусы"
        description="Открывайте подарки, следите за доступными попытками и используйте выигранные промокоды."
      />
      <BonusBoxClientDynamic initialData={data} />
    </div>
  )
}
