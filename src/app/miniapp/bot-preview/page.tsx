import { notFound } from 'next/navigation'
import { BotPreview } from '@/components/miniapp/bot-preview'
import { getBrandName } from '@/lib/branding'
import { miniAppBannerUrl } from '@/lib/miniapp/config'
import { quoteBotPayment } from '@/lib/miniapp/bot-screens'
import { miniAppDemo } from '@/lib/miniapp/model'
export default function BotPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const paymentQuote = quoteBotPayment(miniAppDemo, miniAppDemo.plans[0]?.id ?? 'demo')
  return <BotPreview brandName={getBrandName()} bannerUrl={miniAppBannerUrl()} paymentQuote={paymentQuote} />
}
