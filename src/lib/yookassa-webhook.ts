import { logWarn } from './logger'
import { getClientIp, isIpAllowed } from './security'

export function assertYookassaWebhookSource(
  req: Request,
  allowedIps = process.env.YOOKASSA_WEBHOOK_ALLOWED_IPS || ''
): { ok: true } | { ok: false; error: string } {
  const allowlist = allowedIps
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (allowlist.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      logWarn('webhook.yookassa.allowlist_missing')
      return { ok: false, error: 'Webhook source allowlist is not configured' }
    }
    return { ok: true }
  }

  const ip = getClientIp(req)
  if (!isIpAllowed(ip, allowlist)) {
    logWarn('webhook.yookassa.rejected_ip', { ip: ip || 'unknown' })
    return { ok: false, error: 'Webhook source is not allowed' }
  }

  return { ok: true }
}
