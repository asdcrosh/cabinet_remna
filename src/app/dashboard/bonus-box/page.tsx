import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/cookies'
import { getBonusBoxOverview } from '@/lib/bonus-box'
import { getSeasonalEventsForUser } from '@/lib/seasonal-events'
import { BonusBoxClient } from '@/components/bonus-box/bonus-box-client'
import { SeasonalEventsPanel } from '@/components/bonus-box/seasonal-events-panel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Бонусы' }

export default async function BonusBoxPage() {
  const session = await getCurrentUser()
  if (!session) redirect('/login?next=/dashboard/bonus-box')

  const [data, seasonalEvents] = await Promise.all([
    getBonusBoxOverview(session.uid),
    getSeasonalEventsForUser(session.uid),
  ])

  return (
    <div>
      <SeasonalEventsPanel initialEvents={seasonalEvents} />
      <BonusBoxClient initialData={data} />
    </div>
  )
}
