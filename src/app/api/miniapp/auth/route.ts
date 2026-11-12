import { authenticateTelegramMiniApp } from '@/lib/telegram-miniapp-login'
import { withAuth } from '@/lib/auth/guard'
import { miniAppBotToken, requireMiniApp } from '@/lib/miniapp/config'

export const runtime = 'nodejs'
export const POST = withAuth(async (req: Request) => {
  requireMiniApp()
  return authenticateTelegramMiniApp(req, { botToken: miniAppBotToken(), isolatedBot: true })
})
