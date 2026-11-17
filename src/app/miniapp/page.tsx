import { notFound } from 'next/navigation'
import { getBrandName } from '@/lib/branding'
import { miniAppBannerUrl, miniAppEnabled } from '@/lib/miniapp/config'
import { MiniApp } from '@/components/miniapp/mini-app'

export const metadata = { title: 'Личный кабинет в Telegram', robots: { index: false, follow: false } }
export default function MiniAppPage() {
  if (!miniAppEnabled()) notFound()
  return <MiniApp brandName={getBrandName()} bannerUrl={miniAppBannerUrl()} />
}
