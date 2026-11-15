import { miniAppBotToken } from './config'

// Never log the token-bearing URL or raw Telegram response.
export async function miniAppBotCall<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = miniAppBotToken()
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(7000),
    cache: 'no-store',
  }).catch(() => { throw new Error('Telegram is temporarily unavailable') })
  const data = await response.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null
  if (!response.ok || !data?.ok || data.result === undefined) {
    const details = typeof data?.description === 'string' && data.description.length <= 200 ? `: ${data.description}` : ''
    throw new Error(`Telegram ${method} failed${details}`)
  }
  return data.result
}

// Скачивает файл бота (getFile → file/bot<token>/<path>) с жёстким лимитом размера.
// Возвращает null, если файл недоступен или превышает лимит. Токен в URL не логируем.
export async function downloadTelegramFile(fileId: string, maxBytes: number): Promise<Buffer | null> {
  const meta = await miniAppBotCall<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId }).catch(() => null)
  if (!meta?.file_path) return null
  if (typeof meta.file_size === 'number' && meta.file_size > maxBytes) return null
  const token = miniAppBotToken()
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${meta.file_path}`, {
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  }).catch(() => null)
  if (!response || !response.ok) return null
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length <= 0 || bytes.length > maxBytes) return null
  return bytes
}
