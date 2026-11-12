import { jsonResponse } from '@/lib/json-response'
import { miniAppEnabled } from '@/lib/miniapp/config'
import { handleMiniAppUpdate, isPaymentUpdate, isUnsupportedCallback, telegramUpdateSchema, validWebhookSecret } from '@/lib/miniapp/bot'

export const runtime = 'nodejs'
export async function POST(req: Request) {
  if (!miniAppEnabled()) return jsonResponse({ error: 'Not found' }, { status: 404 })
  if (!validWebhookSecret(req.headers.get('x-telegram-bot-api-secret-token'))) return jsonResponse({ error: 'Forbidden' }, { status: 403 })
  // Bound memory even when the reverse proxy does not enforce its body limit.
  const reader = req.body?.getReader()
  if (!reader) return jsonResponse({ error: 'Invalid body' }, { status: 400 })
  const decoder = new TextDecoder()
  let raw = ''
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 65_536) {
      await reader.cancel()
      return jsonResponse({ error: 'Too large' }, { status: 413 })
    }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  let value: unknown
  try { value = JSON.parse(raw) } catch { return jsonResponse({ error: 'Invalid JSON' }, { status: 400 }) }
  if (isPaymentUpdate(value)) return jsonResponse({ error: 'Payment update requires the existing handler' }, { status: 503 })
  if (isUnsupportedCallback(value)) return jsonResponse({ error: 'Legacy callback requires the existing handler' }, { status: 503 })
  const parsed = telegramUpdateSchema.safeParse(value)
  if (!parsed.success) return jsonResponse({ error: 'Invalid update' }, { status: 400 })
  try {
    await handleMiniAppUpdate(parsed.data)
    return jsonResponse({ ok: true })
  } catch {
    // A 5xx keeps Telegram retries alive; never acknowledge a payment we failed to persist.
    return jsonResponse({ error: 'Retry later' }, { status: 503 })
  }
}
