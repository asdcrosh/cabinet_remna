import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/cookies'
import { getBonusBoxOverview } from '@/lib/bonus-box'
import { BonusBoxClient } from '@/components/bonus-box/bonus-box-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Бонусы' }

export default async function BonusBoxPage() {
  const session = await getCurrentUser()
  if (!session) redirect('/login?next=/dashboard/bonus-box')

  const data = await getBonusBoxOverview(session.uid)

  return (
    <div>
      <BonusBoxClient initialData={data} />
    </div>
  )
}
