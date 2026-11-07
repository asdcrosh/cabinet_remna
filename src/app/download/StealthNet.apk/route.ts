// GET /download/StealthNet.apk — APK приложения StealthNet для большинства телефонов (arm64).
// Ссылка со страницы /app/android: в адресе видно название приложения, а не архитектура.
import { appDownloadResponse } from '@/lib/mobile-app-download'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(req: Request) {
  return appDownloadResponse(req, 'arm64-v8a')
}
