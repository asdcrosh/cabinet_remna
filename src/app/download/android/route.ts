// GET /download/android — APK приложения StealthNet для большинства телефонов (arm64).
import { appDownloadResponse } from '@/lib/mobile-app-download'
import { DEFAULT_APP_ABI } from '@/lib/mobile-app-release'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(req: Request) {
  return appDownloadResponse(req, DEFAULT_APP_ABI)
}
