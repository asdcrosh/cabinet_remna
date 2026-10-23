import { createHmac, timingSafeEqual } from 'node:crypto'

export const BOT_WHITELIST_PATH = '/api/bot/whitelist'

export function verifyBotRequest(req: Request, body: string, now = Date.now()) {
  const secret = process.env.REMNASHOP_BOT_API_SECRET
  if (!secret || secret.length < 32) return false
  const timestamp = req.headers.get('x-bot-timestamp') ?? ''
  const signature = req.headers.get('x-bot-signature') ?? ''
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) return false
  if (Math.abs(now - Number(timestamp) * 1000) > 120_000) return false
  const path = new URL(req.url).pathname
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}\n${req.method}\n${path}\n${body}`)
    .digest()
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
}
