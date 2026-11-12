import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { GET as getReminder } from '@/app/api/mobile/checkout/promo-reminder/route'
import { POST as quoteCheckout } from '@/app/api/mobile/checkout/quote/route'
import { POST as createPayment } from '@/app/api/payment/create/route'
import { signSession } from './auth/jwt'
import { prisma } from './prisma'
import { reconcilePromoExpiryReminders } from './promo-expiry-reminders'

const { requestHeaders } = vi.hoisted(() => ({ requestHeaders: new Headers() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => requestHeaders,
}))

const databaseUrl = process.env.PROMO_REMINDER_TEST_DATABASE_URL
const origin = 'http://localhost:3000'
const duration = 60 * 60 * 1000
const fixture = `promo-qa-${randomUUID()}`
const users: string[] = []
const promos: string[] = []
const prizes: string[] = []
let planId: string

type Channel = 'APP' | 'TELEGRAM' | 'EMAIL'

describe.skipIf(!databaseUrl)('promo expiry with a local database and intercepted providers', () => {
  beforeAll(async () => {
    const url = new URL(databaseUrl!)
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/promo_reminder_integration_qa') {
      throw new Error('Use the isolated local database promo_reminder_integration_qa')
    }
    if (process.env.DATABASE_URL !== databaseUrl) throw new Error('Set DATABASE_URL to the isolated test database before starting Vitest')
    vi.stubEnv('REMNASHOP_DATABASE_URL', '')
    vi.stubEnv('JWT_SECRET', randomUUID() + randomUUID())
    vi.stubEnv('APP_URL', origin)
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-telegram')
    vi.stubEnv('YOOKASSA_SHOP_ID', 'test-shop')
    vi.stubEnv('YOOKASSA_SECRET_KEY', 'test-secret')
    vi.stubEnv('EMAIL_VERIFICATION_WEBHOOK_URL', 'https://email.example.test/send')
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT_BASE64', Buffer.from(JSON.stringify({
      project_id: 'promo-qa',
      client_email: 'promo-qa@example.test',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    })).toString('base64'))
    const plan = await prisma.plan.create({ data: {
      name: fixture, priceKopecks: 20_000, unlimitedDevices: true,
    } })
    planId = plan.id
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    requestHeaders.delete('authorization')
    await prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } })
    await prisma.promoCode.deleteMany({ where: { id: { in: promos.splice(0) } } })
    await prisma.bonusBoxPrize.deleteMany({ where: { id: { in: prizes.splice(0) } } })
  })

  afterAll(async () => {
    if (planId) await prisma.plan.delete({ where: { id: planId } })
    await prisma.$disconnect()
    vi.unstubAllEnvs()
  })

  async function createAccount(telegramId: bigint | null) {
    const user = await prisma.user.create({ data: {
      email: `${randomUUID()}@example.test`, passwordHash: 'test-fixture', emailVerifiedAt: new Date(), telegramId,
    } })
    users.push(user.id)
    return user
  }

  async function createPromo(user: { id: string; email: string }, source = 'manual', hours = 24) {
    const now = new Date()
    const promo = await prisma.promoCode.create({ data: {
      code: `QA-${randomUUID().toUpperCase()}`, discountPercent: 25,
      audience: source === 'manual' ? 'PERSONAL' : 'ALL',
      allowedEmails: source === 'manual' ? [user.email.toUpperCase()] : [],
      expiresAt: new Date(now.getTime() + hours * duration),
      plans: { create: { planId } },
    } })
    promos.push(promo.id)
    if (source === 'welcome') {
      await prisma.welcomeBonusRedemption.create({ data: {
        userId: user.id, type: 'PROMO_CODE', settingId: 'test', promoCodeId: promo.id,
      } })
    }
    if (source === 'roulette') {
      const attempt = await prisma.bonusBoxAttempt.create({ data: { userId: user.id, source: 'MANUAL', sourceKey: promo.id } })
      const prize = await prisma.bonusBoxPrize.create({ data: { title: fixture, type: 'PROMO_CODE_PERCENT', value: 25 } })
      prizes.push(prize.id)
      await prisma.bonusBoxOpening.create({ data: {
        userId: user.id, prizeId: prize.id, attemptId: attempt.id, promoCodeId: promo.id, prizeSnapshot: {},
      } })
    }
    return { promo, now }
  }

  async function addMobileSession(userId: string, lastUsedAt = new Date(), newsAlerts = true) {
    return prisma.mobileSession.create({ data: {
      userId, hwid: randomUUID(), refreshHash: randomUUID(), sessionVersion: 0,
      expiresAt: new Date(Date.now() + 72 * duration), lastUsedAt,
      pushTokens: { create: { userId, token: randomUUID(), newsAlerts } },
    }, include: { pushTokens: true } })
  }

  function interceptProviders(telegram: 'sent' | 'blocked' | 'timeout' = 'sent') {
    const calls: { channel: Channel; payload: Record<string, unknown> }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({ access_token: 'test-push-token', expires_in: 3600 })
      }
      if (url === 'https://api.yookassa.ru/v3/payments' && init.method === 'POST') {
        const payload = JSON.parse(String(init.body))
        return Response.json({
          id: randomUUID(), status: 'pending', paid: false, amount: payload.amount,
          confirmation: { type: 'redirect', confirmation_url: 'https://payment.example.test/confirm' },
        })
      }
      const channel = url.startsWith('https://fcm.googleapis.com/') ? 'APP'
        : url.startsWith('https://api.telegram.org/') ? 'TELEGRAM'
        : url === 'https://email.example.test/send' ? 'EMAIL' : null
      if (!channel) throw new Error('Unexpected outbound request')
      calls.push({ channel, payload: JSON.parse(String(init.body)) })
      if (channel === 'TELEGRAM' && telegram === 'blocked') return new Response('Bot was blocked by the user', { status: 403 })
      if (channel === 'TELEGRAM' && telegram === 'timeout') throw new DOMException('Timeout', 'TimeoutError')
      return Response.json({ ok: true })
    }))
    return calls
  }

  async function authorize(user: { id: string; email: string }, mobileSessionId: string) {
    const token = await signSession({ uid: user.id, email: user.email, role: 'USER' }, { mobileSessionId })
    requestHeaders.set('authorization', `Bearer ${token}`)
  }

  it.each([
    ['APP', 'roulette'],
    ['TELEGRAM', 'welcome'],
    ['EMAIL', 'manual'],
  ] as const)('selects only %s for an unused %s promo under concurrent runs', async (channel, source) => {
    const user = await createAccount(channel === 'EMAIL' ? null : 101n)
    const { promo, now } = await createPromo(user, source)
    const calls = interceptProviders()
    let latestSession
    if (channel === 'APP') {
      await addMobileSession(user.id, new Date(now.getTime() - duration))
      latestSession = await addMobileSession(user.id)
    }
    await reconcilePromoExpiryReminders({ now: new Date(now.getTime() - 1), batchSize: 1 })
    expect(calls).toEqual([])
    await Promise.all([
      reconcilePromoExpiryReminders({ now, batchSize: 1 }),
      reconcilePromoExpiryReminders({ now, batchSize: 1 }),
    ])
    await prisma.promoCode.update({ where: { id: promo.id }, data: { expiresAt: new Date(now.getTime() + duration) } })
    await reconcilePromoExpiryReminders({ now, batchSize: 1 })
    expect(calls.map((call) => call.channel)).toEqual([channel])

    const actionHref = `/dashboard/plans?promoId=${promo.id}`
    const notifications = await prisma.userNotification.findMany({ where: { userId: user.id } })
    if (latestSession) {
      expect(notifications).toMatchObject([{ actionHref, type: 'PROMO_CODE_EXPIRING' }])
      expect(calls[0]?.payload.message).toMatchObject({
        token: latestSession.pushTokens[0]?.token,
        data: { actionHref },
      })
      await authorize(user, latestSession.id)
      const resolved = await getReminder(new Request(`${origin}/api/mobile/checkout/promo-reminder?id=${promo.id}`))
      expect(resolved.status).toBe(200)
      const { code } = await resolved.json()
      const quote = await quoteCheckout(new Request(`${origin}/api/mobile/checkout/quote`, {
        method: 'POST', headers: { origin }, body: JSON.stringify({ planId, promoCode: code }),
      }))
      expect(quote.status).toBe(200)
      expect(await quote.json()).toMatchObject({ totalKopecks: 15_000, discount: { source: 'PROMO', code } })
      const payment = await createPayment(new Request(`${origin}/api/payment/create`, {
        method: 'POST', headers: { origin },
        body: JSON.stringify({ planId, promoCode: code, provider: 'YOOKASSA', idempotencyKey: randomUUID() }),
      }))
      expect(payment.status).toBe(200)
      expect(await prisma.payment.findFirst({ where: { userId: user.id } })).toMatchObject({
        amountKopecks: 15_000, promoCodeId: promo.id, promoCodeSnapshot: { code },
      })
      const other = await createAccount(null)
      await authorize(other, (await addMobileSession(other.id)).id)
      const forbidden = await getReminder(new Request(`${origin}/api/mobile/checkout/promo-reminder?id=${promo.id}`))
      expect(forbidden.status).toBe(404)
      expect(await forbidden.json()).not.toHaveProperty('code', code)
    } else {
      expect(notifications).toEqual([])
      expect(JSON.stringify(calls[0]?.payload)).toContain(`${origin}${actionHref}`)
      expect(JSON.stringify(calls[0]?.payload)).not.toContain(promo.code)
    }
  })

  it.each([
    ['blocked', ['TELEGRAM', 'EMAIL']],
    ['timeout', ['TELEGRAM']],
  ] as const)('uses the email fallback only when Telegram is confirmed unavailable (%s)', async (outcome, expected) => {
    const user = await createAccount(102n)
    const { now } = await createPromo(user)
    const calls = interceptProviders(outcome)
    await reconcilePromoExpiryReminders({ now })
    await reconcilePromoExpiryReminders({ now })
    expect(calls.map((call) => call.channel)).toEqual(expected)
  })

  it('keeps only the app centre entry when push is disabled', async () => {
    const user = await createAccount(103n)
    const { now } = await createPromo(user)
    await addMobileSession(user.id, now, false)
    const calls = interceptProviders()
    await reconcilePromoExpiryReminders({ now })
    expect(calls).toEqual([])
    expect(await prisma.userNotification.count({ where: { userId: user.id } })).toBe(1)
  })

  it('does not repeat an interrupted external delivery after a restart', async () => {
    const user = await createAccount(104n)
    const { promo, now } = await createPromo(user)
    const calls = interceptProviders()
    await prisma.promoCodeReminder.create({
      data: { userId: user.id, promoCodeId: promo.id, channel: 'TELEGRAM', status: 'SENDING', updatedAt: new Date(now.getTime() - duration) },
    })
    await reconcilePromoExpiryReminders({ now })
    expect(calls).toEqual([])
    expect(await prisma.promoCodeReminder.findFirst({ where: { userId: user.id } })).toMatchObject({ status: 'UNKNOWN' })
  })

  it('skips public, expired and unprofitable codes and users who opted out', async () => {
    const user = await createAccount(104n)
    await createPromo(user, 'public')
    await createPromo(user, 'manual', -1)
    await createPromo(user)
    await prisma.user.update({ where: { id: user.id }, data: { personalDiscountPercent: 30 } })
    const optedOut = await createAccount(null)
    await createPromo(optedOut)
    await prisma.userNotificationPreference.create({ data: { userId: optedOut.id, broadcastsEnabled: false } })
    const calls = interceptProviders()
    await reconcilePromoExpiryReminders()
    expect(calls).toEqual([])
  })
})
