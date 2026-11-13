import { notFound } from 'next/navigation'
import { miniAppEnabled } from '@/lib/miniapp/config'
import { MiniAppEntry } from '@/components/miniapp/mini-app-entry'

export const metadata = { title: 'AlekseevVP в Telegram', robots: { index: false, follow: false } }
export default function MiniAppPage() {
  if (!miniAppEnabled()) notFound()
  return <MiniAppEntry />
}
