import { getClientIp, isIpAllowed } from './security'

export function assertYookassaWebhookSource(req: Request): { ok: true } | { ok: false; error: string } {
  const allowlist = (process.env.YOOKASSA_WEBHOOK_ALLOWED_IPS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (allowlist.length === 0) return { ok: true }

  const ip = getClientIp(req)
  if (!isIpAllowed(ip, allowlist)) {
    console.warn(`[webhook] rejected YooKassa webhook from IP: ${ip || 'unknown'}`)
    return { ok: false, error: 'Webhook source is not allowed' }
  }

  return { ok: true }
}
