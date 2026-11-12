import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(() => true), validSecret: vi.fn(() => true), owned: vi.fn(),
  parse: vi.fn(), handle: vi.fn(), forward: vi.fn(),
}))
vi.mock('@/lib/miniapp/config', () => ({ miniAppEnabled: mocks.enabled }))
vi.mock('@/lib/miniapp/bot', () => ({
  validWebhookSecret: mocks.validSecret,
  isMiniAppOwnedUpdate: mocks.owned,
  telegramUpdateSchema: { safeParse: mocks.parse },
  handleMiniAppUpdate: mocks.handle,
}))
vi.mock('@/lib/miniapp/legacy-forward', () => ({ forwardLegacyTelegramUpdate: mocks.forward }))

import { POST } from './route'

function update(body: string) {
  return new Request('https://cabinet.example.test/api/telegram-miniapp/webhook', {
    method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'secret' }, body,
  })
}

describe('Telegram webhook handover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.enabled.mockReturnValue(true)
    mocks.validSecret.mockReturnValue(true)
    mocks.owned.mockReturnValue(false)
    mocks.forward.mockResolvedValue(true)
    mocks.parse.mockReturnValue({ success: true, data: { update_id: 1 } })
    mocks.handle.mockResolvedValue(undefined)
  })

  it('forwards the original bytes for an old callback and acknowledges only a successful handoff', async () => {
    const raw = '{"update_id":1,"callback_query":{"data":"old"}}'
    expect((await POST(update(raw))).status).toBe(200)
    expect(mocks.forward).toHaveBeenCalledWith(raw)
    expect(mocks.handle).not.toHaveBeenCalled()
    mocks.forward.mockResolvedValue(false)
    expect((await POST(update(raw))).status).toBe(503)
  })

  it('routes a new payment locally and asks Telegram to retry if persistence fails', async () => {
    mocks.owned.mockReturnValue(true)
    const raw = JSON.stringify({ update_id: 1, pre_checkout_query: { invoice_payload: 'avp:ck12345678901234567890' } })
    expect((await POST(update(raw))).status).toBe(200)
    expect(mocks.handle).toHaveBeenCalledWith({ update_id: 1 })
    expect(mocks.forward).not.toHaveBeenCalled()
    mocks.handle.mockRejectedValue(new Error('Database unavailable'))
    expect((await POST(update(raw))).status).toBe(503)
  })

  it('rejects an unauthenticated webhook before forwarding anything', async () => {
    mocks.validSecret.mockReturnValue(false)
    expect((await POST(update('{"update_id":1}'))).status).toBe(403)
    expect(mocks.forward).not.toHaveBeenCalled()
  })
})
