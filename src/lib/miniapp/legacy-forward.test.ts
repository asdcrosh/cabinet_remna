import { afterEach, describe, expect, it, vi } from 'vitest'
import { forwardLegacyTelegramUpdate } from './legacy-forward'

describe('legacy Telegram webhook bridge', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('does not acknowledge legacy traffic without a configured receiver', async () => {
    vi.stubEnv('TELEGRAM_LEGACY_WEBHOOK_URL', '')
    vi.stubEnv('TELEGRAM_LEGACY_WEBHOOK_SECRET', '')
    expect(await forwardLegacyTelegramUpdate('{"update_id":1}')).toBe(false)
  })

  it('forwards the exact update only to the configured HTTPS receiver', async () => {
    vi.stubEnv('APP_URL', 'https://cabinet.example.test')
    vi.stubEnv('TELEGRAM_LEGACY_WEBHOOK_URL', 'https://legacy.example.test/api/v1/telegram')
    vi.stubEnv('TELEGRAM_LEGACY_WEBHOOK_SECRET', 'a'.repeat(48))
    const send = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', send)
    const raw = '{"update_id":7,"callback_query":{"data":"old"}}'
    expect(await forwardLegacyTelegramUpdate(raw)).toBe(true)
    expect(send).toHaveBeenCalledWith(new URL('https://legacy.example.test/api/v1/telegram'),
      expect.objectContaining({ body: raw, redirect: 'error', headers: expect.objectContaining({
        'x-telegram-bot-api-secret-token': 'a'.repeat(48),
      }) }))
  })

  it('rejects a loop or unencrypted receiver', async () => {
    vi.stubEnv('APP_URL', 'https://cabinet.example.test')
    vi.stubEnv('TELEGRAM_LEGACY_WEBHOOK_SECRET', 'a'.repeat(48))
    vi.stubEnv('TELEGRAM_LEGACY_WEBHOOK_URL', 'https://cabinet.example.test/api/telegram-miniapp/webhook')
    await expect(forwardLegacyTelegramUpdate('{}')).rejects.toThrow('points to the Mini App')
    vi.stubEnv('TELEGRAM_LEGACY_WEBHOOK_URL', 'http://legacy.example.test/api/v1/telegram')
    await expect(forwardLegacyTelegramUpdate('{}')).rejects.toThrow('Invalid legacy webhook URL')
  })
})
