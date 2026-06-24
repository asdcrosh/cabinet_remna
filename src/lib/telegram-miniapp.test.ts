import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyTelegramMiniAppInitData } from './telegram-auth'

const originalToken = process.env.TELEGRAM_BOT_TOKEN

afterEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = originalToken
})

function createInitData(botToken: string) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'test-query',
    signature: 'telegram-public-signature',
    user: JSON.stringify({
      id: 8507156675,
      first_name: 'Artem',
      username: 'artem_test',
      language_code: 'ru',
    }),
  })
  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  params.set('hash', createHmac('sha256', secretKey).update(checkString).digest('hex'))
  return params.toString()
}

describe('Telegram Mini App init data', () => {
  it('accepts authentic signed init data', () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:test-token'
    const user = verifyTelegramMiniAppInitData(createInitData(process.env.TELEGRAM_BOT_TOKEN))

    expect(user).toMatchObject({
      id: 8507156675n,
      username: 'artem_test',
      name: 'Artem',
      languageCode: 'ru',
    })
  })

  it('rejects modified data', () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:test-token'
    const initData = createInitData(process.env.TELEGRAM_BOT_TOKEN).replace('Artem', 'Hacker')

    expect(() => verifyTelegramMiniAppInitData(initData)).toThrow('Invalid Telegram Mini App signature')
  })
})
