import { authenticateTelegramMiniApp } from '@/lib/telegram-miniapp-login'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  return authenticateTelegramMiniApp(req)
}
