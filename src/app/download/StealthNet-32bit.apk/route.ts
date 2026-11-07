// GET /download/StealthNet-32bit.apk — APK приложения StealthNet для старых 32-битных телефонов.
import { appDownloadResponse } from '@/lib/mobile-app-download'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(req: Request) {
  return appDownloadResponse(req, 'armeabi-v7a')
}
