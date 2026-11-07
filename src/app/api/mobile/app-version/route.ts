// GET /api/mobile/app-version?abi=arm64-v8a — текущий выпуск приложения StealthNet
// для автообновления: версия, номер сборки, минимальная допустимая сборка,
// ссылка на APK своей архитектуры и его SHA-256. Без входа: проверка идёт до логина.
import { jsonResponse } from '@/lib/json-response'
import { appDownloadPath, DEFAULT_APP_ABI, getAppRelease, isAppAbi } from '@/lib/mobile-app-release'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'no-store' }

export async function GET(req: Request) {
  const limited = await rateLimit(req, 'mobile-app-version', 60, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429, headers: { ...noStore, 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const requested = new URL(req.url).searchParams.get('abi')
  if (requested && !isAppAbi(requested)) {
    return jsonResponse({ error: 'UNKNOWN_ABI' }, { status: 400, headers: noStore })
  }
  const abi = requested && isAppAbi(requested) ? requested : DEFAULT_APP_ABI

  const release = await getAppRelease()
  if (!release) return jsonResponse({ error: 'NO_RELEASE' }, { status: 404, headers: noStore })
  const file = release.files[abi]
  if (!file) return jsonResponse({ error: 'NO_BUILD_FOR_ABI' }, { status: 404, headers: noStore })

  return jsonResponse(
    {
      version: release.version,
      build: release.build,
      minBuild: release.minBuild,
      notes: release.notes,
      abi,
      url: appDownloadPath(abi),
      sha256: file.sha256,
      size: file.size,
    },
    { headers: noStore }
  )
}
