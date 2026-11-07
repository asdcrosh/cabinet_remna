// GET /download/android/<abi> — APK приложения StealthNet под архитектуру телефона.
import { jsonResponse } from '@/lib/json-response'
import { appDownloadResponse } from '@/lib/mobile-app-download'
import { isAppAbi } from '@/lib/mobile-app-release'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ abi: string }> }) {
  const { abi } = await ctx.params
  if (!isAppAbi(abi)) return jsonResponse({ error: 'Not found' }, { status: 404 })
  return appDownloadResponse(req, abi)
}
