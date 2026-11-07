// GET /.well-known/assetlinks.json — подтверждение App Links для приложения StealthNet.
import { jsonResponse } from '@/lib/json-response'
import { getAndroidAppLinkTargets } from '@/lib/mobile-app-links'

export const dynamic = 'force-dynamic'

export function GET() {
  return jsonResponse(getAndroidAppLinkTargets(), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
