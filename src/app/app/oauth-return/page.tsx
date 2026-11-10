// /app/oauth-return?code=… — возврат в приложение StealthNet после входа через браузер.
// Подтверждённое приложение (App Links) открывается сразу по этому адресу. Если нет
// страница адресует возврат Android-пакету StealthNet, чтобы не появлялся выбор приложений.
import { LogIn, Smartphone } from 'lucide-react'
import { headers } from 'next/headers'
import { SystemState } from '@/components/ui/system-state'
import { getBrandName } from '@/lib/branding'
import { MOBILE_APP_RETURN_URL } from '@/lib/auth/mobile-oauth'
import { getAndroidAppPackageName } from '@/lib/mobile-app-links'

export const dynamic = 'force-dynamic'

const CODE = /^[A-Za-z0-9_-]{16,128}$/
const ERRORS = new Set([
  'expired', 'login_failed', 'server_error',
  'telegram_not_linked', 'telegram_consent_required', 'telegram_cancelled', 'telegram_unavailable', 'telegram_failed',
])

export default async function OAuthReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[]; error?: string | string[] }>
}) {
  const [params, requestHeaders] = await Promise.all([searchParams, headers()])
  const url = new URL(MOBILE_APP_RETURN_URL)
  if (typeof params.code === 'string' && CODE.test(params.code)) url.searchParams.set('code', params.code)
  else if (typeof params.error === 'string' && ERRORS.has(params.error)) url.searchParams.set('error', params.error)
  else url.searchParams.set('error', 'login_failed')
  const isAndroid = /\bAndroid\b/i.test(requestHeaders.get('user-agent') ?? '')
  const appUrl = isAndroid
    ? `intent://${url.host}${url.search}#Intent;scheme=${url.protocol.slice(0, -1)};package=${getAndroidAppPackageName()};end`
    : url.toString()
  const brandName = getBrandName()

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      <meta name="referrer" content="no-referrer" />
      <meta httpEquiv="refresh" content={`0;url=${appUrl}`} />
      <SystemState
        eyebrow={brandName}
        icon={<LogIn className="h-7 w-7" />}
        title="Возвращаемся в приложение"
        description="Откройте приложение, чтобы увидеть результат входа."
        action={(
          <a href={appUrl} className="btn-primary w-full sm:w-auto">
            <Smartphone className="h-4 w-4" />
            Открыть {brandName}
          </a>
        )}
      />
    </main>
  )
}
