import { NextResponse, type NextRequest } from 'next/server'
import { isRequestLoggingEnabled, logInfo, withRequestLogContext } from '@/lib/logger'
import { getClientIp as getTrustedClientIp } from '@/lib/security'

export function proxy(req: NextRequest) {
  const requestId = getRequestId(req)
  return withRequestLogContext({ requestId }, () => handleMiddleware(req, requestId))
}

function handleMiddleware(req: NextRequest, requestId: string) {
  const res = getMiddlewareResponse(req, requestId)
  applySecurityHeaders(res, req)
  res.headers.set('x-request-id', requestId)

  if (isRequestLoggingEnabled()) {
    logInfo('http.request', {
      requestId,
      method: req.method,
      path: req.nextUrl.pathname,
      queryKeys: getQueryKeys(req),
      ip: getTrustedClientIp(req) || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
      referer: getSafeReferer(req.headers.get('referer')),
    })
  }

  return res
}

function getMiddlewareResponse(req: NextRequest, requestId: string) {
  if (req.nextUrl.pathname.startsWith('/dashboard') && !req.cookies.get('cabinet_session')?.value) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', `${req.nextUrl.pathname}${req.nextUrl.search}`)
    return NextResponse.redirect(url)
  }

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-request-id', requestId)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

function applySecurityHeaders(res: NextResponse, req: NextRequest) {
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set(
    'Referrer-Policy',
    isSensitiveQueryPath(req.nextUrl.pathname) ? 'no-referrer' : 'strict-origin-when-cross-origin'
  )
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  res.headers.set('X-Permitted-Cross-Domain-Policies', 'none')

  if (req.nextUrl.protocol === 'https:') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  if (process.env.NODE_ENV === 'production') {
    const sentryOrigin = getSentryOrigin()
    res.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self' 'unsafe-inline' https://telegram.org",
        `connect-src 'self' https://oauth.telegram.org${sentryOrigin ? ` ${sentryOrigin}` : ''}`,
        'upgrade-insecure-requests',
      ].join('; ')
    )
  }
}

function getSentryOrigin() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
  if (!dsn) return ''
  try {
    return new URL(dsn).origin
  } catch {
    return ''
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

function getQueryKeys(req: NextRequest) {
  const keys = [...new Set(req.nextUrl.searchParams.keys())]
  return keys.length > 0 ? keys.slice(0, 50) : undefined
}

function getSafeReferer(value: string | null) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`
  } catch {
    return undefined
  }
}

function isSensitiveQueryPath(pathname: string) {
  return [
    '/reset-password',
    '/api/auth/verify-email',
    '/api/auth/yandex/callback',
    '/api/me/telegram/oidc/callback',
  ].includes(pathname)
}

function getRequestId(req: NextRequest) {
  const existing = req.headers.get('x-request-id')?.trim()
  if (existing && /^[a-zA-Z0-9._:-]{8,128}$/.test(existing)) return existing
  return crypto.randomUUID()
}
