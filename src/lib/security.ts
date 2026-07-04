const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function assertSameOrigin(req: Request) {
  if (!MUTATION_METHODS.has(req.method)) return

  const origin = req.headers.get('origin')
  if (!origin) return

  const allowedOrigins = new Set([new URL(req.url).origin])

  if (trustProxyHeaders()) {
    const forwardedOrigin = getForwardedOrigin(req)
    if (forwardedOrigin) allowedOrigins.add(forwardedOrigin)
  }

  for (const configuredOrigin of getConfiguredOrigins()) {
    allowedOrigins.add(configuredOrigin)
  }

  if (!allowedOrigins.has(origin)) {
    throw new Error('Invalid request origin')
  }
}

function getConfiguredOrigins() {
  return [
    process.env.APP_URL,
    process.env.NEXTAUTH_URL,
    ...(process.env.ALLOWED_ORIGINS || '').split(','),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .map((value) => new URL(value).origin)
}

function getForwardedOrigin(req: Request) {
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  if (!forwardedHost) return null

  const forwardedProto =
    req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    new URL(req.url).protocol.replace(':', '')

  return `${forwardedProto}://${forwardedHost}`
}

export function getClientIp(req: Request) {
  if (!trustProxyHeaders()) return ''

  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    forwardedFor ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    ''
  )
}

function trustProxyHeaders() {
  return ['1', 'true', 'yes', 'on'].includes((process.env.TRUSTED_PROXY_HEADERS || '').toLowerCase())
}

export function isIpAllowed(ip: string, allowlist: string[]) {
  if (allowlist.length === 0) return true
  if (!ip) return false

  return allowlist.some((entry) => {
    const rule = entry.trim()
    if (!rule) return false
    if (!rule.includes('/')) return rule === ip
    return isIpv4InCidr(ip, rule)
  })
}

function isIpv4InCidr(ip: string, cidr: string) {
  const [range, bitsRaw] = cidr.split('/')
  const bits = Number(bitsRaw)
  if (!range || !Number.isInteger(bits) || bits < 0 || bits > 32) return false

  const ipInt = ipv4ToInt(ip)
  const rangeInt = ipv4ToInt(range)
  if (ipInt == null || rangeInt == null) return false

  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (ipInt & mask) === (rangeInt & mask)
}

function ipv4ToInt(ip: string) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null
  }
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0
}
