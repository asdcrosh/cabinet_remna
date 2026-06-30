import { redirect } from 'next/navigation'
import { Gift } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/cookies'
import { getBonusBoxOverview } from '@/lib/bonus-box'
import { PageHeader } from '@/components/dashboard/page-header'
import { BonusBoxClient } from '@/components/bonus-box/bonus-box-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Бонусы' }

export default async function BonusBoxPage() {
  const session = await getCurrentUser()
  if (!session) redirect('/login?next=/dashboard/bonus-box')

  const data = await getBonusBoxOverview(session.uid)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Бонусы"
        description="Открывайте подарки за покупки, приглашения и еженедельный бонус"
        action={<Gift className="h-5 w-5 text-brand-500" />}
      />
      <BonusBoxClient initialData={data} />
    </div>
  )
}
