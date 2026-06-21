export function getAppUrl() {
  const raw = process.env.APP_URL || process.env.NEXTAUTH_URL
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('APP_URL is required in production')
    }
    return 'http://localhost:3000'
  }

  const url = new URL(raw)
  if (process.env.NODE_ENV === 'production') {
    if (url.protocol !== 'https:') {
      throw new Error('APP_URL must use https in production')
    }
    if (isLocalHost(url.hostname)) {
      throw new Error('APP_URL must not point to localhost in production')
    }
  }

  return url.origin
}

export function getAppUrlOrRequestOrigin(req: Request) {
  try {
    return getAppUrl()
  } catch (e) {
    if (process.env.NODE_ENV === 'production') throw e
    return new URL(req.url).origin
  }
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}
