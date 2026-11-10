import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn(), subscription: vi.fn() }))
vi.mock('@/lib/auth/guard', () => ({ requireAuth: mocks.session, withAuth: <T>(handler: T) => handler }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.user } } }))
vi.mock('@/lib/remnawave', () => ({ remnawave: { getSubscriptionByUsername: mocks.subscription } }))

import { GET } from './route'

const account = { email: 'telegram-123@pending.invalid', emailVerifiedAt: null, remnawaveUsername: 'member' }
const url = 'https://subscription.example/test-only'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.session.mockResolvedValue({ uid: 'member', aud: 'mobile', sid: 'ms-1' })
  mocks.subscription.mockResolvedValue({ response: { subscriptionUrl: url, user: { isActive: true } } })
})

it('после срока мобильная сессия не получает ссылку на подписку', async () => {
  const deadline = new Date(Date.now() - 60_000)
  mocks.user.mockResolvedValue({ ...account, mobileTelegramEmailDueAt: deadline })
  const result = await GET()
  expect(await result.json()).toMatchObject({ keys: null, mobileEmailDeadline: deadline.toISOString() })
  expect(mocks.subscription).not.toHaveBeenCalled()
})

it('до срока отдаёт ключи и срок для службы, после подтверждения только ключи', async () => {
  const deadline = new Date(Date.now() + 60_000)
  mocks.user.mockResolvedValueOnce({ ...account, mobileTelegramEmailDueAt: deadline })
  expect(await (await GET()).json()).toMatchObject({
    keys: { subscriptionUrl: url }, mobileEmailDeadline: deadline.toISOString(), serverTime: expect.any(String),
  })
  mocks.user.mockResolvedValueOnce({ ...account, mobileTelegramEmailDueAt: deadline, email: 'test@example.com', emailVerifiedAt: new Date() })
  const verified = await (await GET()).json()
  expect(verified.keys).toEqual({ subscriptionUrl: url })
  expect(verified.mobileEmailDeadline).toBeUndefined()
})
