import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BOT_WHITELIST_PATH, verifyBotRequest } from './bot-api-auth'

const secret = 'test-only-shared-secret-32-characters'
const timestamp = '1792700000'
const body = '{"action":"offer","sourceUserId":7,"telegramId":"123"}'
const signature = createHmac('sha256', secret).update(`${timestamp}\nPOST\n${BOT_WHITELIST_PATH}\n${body}`).digest('hex')
function request(path = BOT_WHITELIST_PATH, time = timestamp, signed = signature) {
  return new Request(`https://cabinet.test${path}`, { method: 'POST', headers: { 'x-bot-timestamp': time, 'x-bot-signature': signed } })
}
afterEach(() => vi.unstubAllEnvs())
describe('bot request authentication', () => {
  it('accepts the exact signed body and binds identity, method, path and timestamp', () => {
    vi.stubEnv('REMNASHOP_BOT_API_SECRET', secret)
    const now = Number(timestamp) * 1000
    expect(verifyBotRequest(request(), body, now)).toBe(true)
    expect(verifyBotRequest(request(), body.replace('123', '124'), now)).toBe(false)
    expect(verifyBotRequest(request('/api/another'), body, now)).toBe(false)
    expect(verifyBotRequest(request(), body, now + 121_000)).toBe(false)
    expect(verifyBotRequest(request(), body, now - 121_000)).toBe(false)
    expect(verifyBotRequest(request(undefined, timestamp, 'x'.repeat(64)), body, now)).toBe(false)
  })
  it('is disabled with a missing or short server secret', () => {
    vi.stubEnv('REMNASHOP_BOT_API_SECRET', '')
    expect(verifyBotRequest(request(), body)).toBe(false)
    vi.stubEnv('REMNASHOP_BOT_API_SECRET', 'short')
    expect(verifyBotRequest(request(), body)).toBe(false)
  })
})
