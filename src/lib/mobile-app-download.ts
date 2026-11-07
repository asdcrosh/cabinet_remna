// Отдача APK приложения StealthNet: /download/StealthNet.apk, /download/StealthNet-32bit.apk
// (для людей, со страницы /app/android) и /download/android/<abi> (для автообновления).
import { NextResponse } from 'next/server'
import { jsonResponse } from '@/lib/json-response'
import { type AppAbi, openAppReleaseFile } from '@/lib/mobile-app-release'
import { rateLimit } from '@/lib/rate-limit'

export async function appDownloadResponse(req: Request, abi: AppAbi) {
  const limited = await rateLimit(req, 'mobile-app-download', 20, 10 * 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много скачиваний. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const opened = await openAppReleaseFile(abi)
  if (!opened) return jsonResponse({ error: 'NO_RELEASE' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })

  const { manifest, entry, body } = opened
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': String(entry.size),
      'Content-Disposition': `attachment; filename="${appDownloadFileName(manifest.version, abi)}"`,
      // Адрес не меняется между выпусками — не кэшировать надолго.
      'Cache-Control': 'public, max-age=300',
      'X-Content-SHA256': entry.sha256,
    },
  })
}

// Имя сохранённого файла — понятное человеку, без архитектуры для обычных телефонов.
export function appDownloadFileName(version: string, abi: AppAbi) {
  const suffix = abi === 'arm64-v8a' ? '' : abi === 'armeabi-v7a' ? '-32bit' : `-${abi}`
  return `StealthNet-${version}${suffix}.apk`
}
