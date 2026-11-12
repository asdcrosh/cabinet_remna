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
  const data = await response.json().catch(() => null) as { ok?: boolean; result?: T } | null
  if (!response.ok || !data?.ok || data.result === undefined) throw new Error(`Telegram ${method} failed`)
  return data.result
}
