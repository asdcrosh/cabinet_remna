import { notFound } from 'next/navigation'
import { BotPreview } from '@/components/miniapp/bot-preview'
export default function BotPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <BotPreview />
}
