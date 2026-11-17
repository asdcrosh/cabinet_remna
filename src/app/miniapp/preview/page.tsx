import { notFound } from 'next/navigation'
import { MiniApp } from '@/components/miniapp/mini-app'
import { getBrandName } from '@/lib/branding'
import { miniAppBannerUrl } from '@/lib/miniapp/config'

export default function MiniAppPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <MiniApp demo brandName={getBrandName()} bannerUrl={miniAppBannerUrl()} />
}
