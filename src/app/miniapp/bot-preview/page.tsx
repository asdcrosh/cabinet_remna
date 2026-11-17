import { notFound } from 'next/navigation'
import { BotPreview } from '@/components/miniapp/bot-preview'
import { getBrandName } from '@/lib/branding'
import { miniAppBannerUrl } from '@/lib/miniapp/config'
export default function BotPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <BotPreview brandName={getBrandName()} bannerUrl={miniAppBannerUrl()} />
}
