import { NextResponse, type NextRequest } from 'next/server'
import { isRequestLoggingEnabled, logInfo } from '@/lib/logger'

export function middleware(req: NextRequest) {
  const requestId = getRequestId(req)
  const res = getMiddlewareResponse(req, requestId)

  applySecurityHeaders(res, req)
  res.headers.set('x-request-id', requestId)

  if (isRequestLoggingEnabled()) {
    logInfo('http.request', {
      requestId,
      method: req.method,
      path: req.nextUrl.pathname,
      search: req.nextUrl.search || undefined,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent') || undefined,
      referer: req.headers.get('referer') || undefined,
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
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  res.headers.set('X-Permitted-Cross-Domain-Policies', 'none')

  if (req.nextUrl.protocol === 'https:') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  if (process.env.NODE_ENV === 'production') {
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
        "connect-src 'self' https://oauth.telegram.org",
        'upgrade-insecure-requests',
      ].join('; ')
    )
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

function getClientIp(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    undefined
  )
}

function getRequestId(req: NextRequest) {
  const existing = req.headers.get('x-request-id')?.trim()
  if (existing && /^[a-zA-Z0-9._:-]{8,128}$/.test(existing)) return existing
  return crypto.randomUUID()
}
