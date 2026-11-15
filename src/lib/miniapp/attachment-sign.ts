import { createHmac, timingSafeEqual } from 'node:crypto'

// Подписанные ссылки на вложения поддержки для окна бота: изображение
// подгружается Telegram-клиентом без сессии кабинета, поэтому доступ
// ограничен подписью id вложения секретом webhook-а.
function attachmentSecret() {
  const secret = process.env.TELEGRAM_MINIAPP_WEBHOOK_SECRET?.trim()
  if (!secret || secret.length < 32) return null
  return secret
}

export function signSupportAttachmentId(id: string) {
  const secret = attachmentSecret()
  if (!secret) return null
  return createHmac('sha256', secret).update(`support-attachment:${id}`).digest('hex').slice(0, 40)
}

export function verifySupportAttachmentSignature(id: string, signature: string | null) {
  const expected = signSupportAttachmentId(id)
  if (!expected || !signature || signature.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

export function botSupportAttachmentUrl(id: string) {
  const signature = signSupportAttachmentId(id)
  if (!signature || !process.env.APP_URL) return null
  const url = new URL(`/api/miniapp/support-attachment/${id}`, process.env.APP_URL)
  url.searchParams.set('s', signature)
  return url.toString()
}
