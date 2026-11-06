import { generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: { mobilePushToken: { findMany: mocks.findMany, deleteMany: mocks.deleteMany } },
}))
vi.mock('./logger', () => ({ logError: vi.fn(), logWarn: vi.fn() }))

import { pushCategory, readServiceAccount, resetPushAccessTokenCache, sendPushToUser } from './push'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const account = {
  project_id: 'stealthnet-test',
  client_email: 'push@stealthnet-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('push', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetPushAccessTokenCache()
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 = Buffer.from(JSON.stringify(account)).toString('base64')
    mocks.deleteMany.mockResolvedValue({ count: 0 })
  })
  afterEach(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  })

  it('категории совпадают с переключателями приложения', () => {
    expect(pushCategory('SUBSCRIPTION_EXPIRING')).toBe('subscription')
    expect(pushCategory('TRAFFIC_LIMIT')).toBe('subscription')
    expect(pushCategory('PAYMENT_SUCCESS')).toBe('payments')
    expect(pushCategory('SUPPORT_REPLY')).toBe('payments')
    expect(pushCategory('BROADCAST')).toBe('news')
    expect(pushCategory('BONUS_GRANTED')).toBe('news')
    expect(pushCategory('ACCOUNT_SECURITY')).toBe('security')
  })

  it('без ключа Firebase ничего не делает', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
    const fetchMock = vi.fn()
    expect(await sendPushToUser({ userId: 'u1', type: 'SUPPORT_REPLY', title: 't', body: 'b' }, fetchMock)).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.findMany).not.toHaveBeenCalled()
    expect(readServiceAccount('not-base64-json')).toBeNull()
  })

  it('только действующие сессии и включённая категория', async () => {
    mocks.findMany.mockResolvedValue([])
    await sendPushToUser({ userId: 'u1', type: 'PAYMENT_SUCCESS', title: 't', body: 'b' }, vi.fn())
    const where = mocks.findMany.mock.calls[0]![0].where
    expect(where.userId).toBe('u1')
    expect(where.paymentAlerts).toBe(true)
    expect(where.subscriptionAlerts).toBeUndefined()
    expect(where.mobileSession.revokedAt).toBeNull()

    mocks.findMany.mockClear()
    await sendPushToUser({ userId: 'u1', type: 'ACCOUNT_SECURITY', title: 't', body: 'b' }, vi.fn())
    const security = mocks.findMany.mock.calls[0]![0].where
    expect(security.paymentAlerts).toBeUndefined()
    expect(security.newsAlerts).toBeUndefined()
  })

  it('отправляет через FCM v1 и удаляет токены, которые Firebase больше не знает', async () => {
    mocks.findMany.mockResolvedValue([{ id: 't-ok', token: 'tok-ok' }, { id: 't-dead', token: 'tok-dead' }])
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      if (u.startsWith('https://oauth2.googleapis.com/token')) {
        const form = new URLSearchParams(String(init?.body))
        expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
        expect(form.get('assertion')?.split('.')).toHaveLength(3)
        return json({ access_token: 'ya29.test', expires_in: 3600 })
      }
      expect(u).toBe('https://fcm.googleapis.com/v1/projects/stealthnet-test/messages:send')
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer ya29.test')
      const body = JSON.parse(String(init?.body))
      if (body.message.token === 'tok-dead') {
        return json({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }, 404)
      }
      expect(body.message).toEqual({
        token: 'tok-ok',
        notification: { title: 'Ответ поддержки', body: 'Посмотрите обращение' },
        data: { type: 'SUPPORT_REPLY', actionHref: '/dashboard/support/t1' },
        android: { priority: 'HIGH', notification: { channel_id: 'stealthnet_alerts' } },
      })
      return json({ name: 'projects/stealthnet-test/messages/1' })
    })

    const sent = await sendPushToUser({
      userId: 'u1',
      type: 'SUPPORT_REPLY',
      title: 'Ответ поддержки',
      body: 'Посмотрите обращение',
      actionHref: '/dashboard/support/t1',
    }, fetchMock as unknown as typeof fetch)

    expect(sent).toBe(1)
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['t-dead'] } } })

    // OAuth-токен Google переиспользуется.
    fetchMock.mockClear()
    mocks.findMany.mockResolvedValue([{ id: 't-ok', token: 'tok-ok' }])
    await sendPushToUser({ userId: 'u1', type: 'SUPPORT_REPLY', title: 'Ответ поддержки', body: 'Посмотрите обращение', actionHref: '/dashboard/support/t1' }, fetchMock as unknown as typeof fetch)
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('oauth2'))).toHaveLength(0)
  })

  it('сбой Google не бросает исключение', async () => {
    mocks.findMany.mockResolvedValue([{ id: 't1', token: 'tok' }])
    const fetchMock = vi.fn(async () => json({ error: 'invalid_grant' }, 400))
    await expect(sendPushToUser({ userId: 'u1', type: 'BROADCAST', title: 't', body: 'b' }, fetchMock as unknown as typeof fetch)).resolves.toBe(0)
  })
})
