import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const { TestAuthError, mocks } = vi.hoisted(() => {
  class TestAuthError extends Error {
    constructor(public status: number, message: string) {
      super(message)
      this.name = 'AuthError'
    }
  }
  return {
    TestAuthError,
    mocks: {
      requireAdmin: vi.fn(),
      userFindMany: vi.fn(),
      paymentFindMany: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth/guard', () => ({
  AuthError: TestAuthError,
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (...args: any[]) => Promise<NextResponse>) => async (...args: any[]) => {
    try {
      return await handler(...args)
    } catch (error) {
      if (error instanceof TestAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      throw error
    }
  },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
    payment: { findMany: mocks.paymentFindMany },
  },
}))

import { GET } from './route'

function search(q?: string) {
  const url = new URL('https://cabinet.example/api/admin/search')
  if (q !== undefined) url.searchParams.set('q', q)
  return GET(new Request(url))
}

describe('admin global search route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin-1' })
    mocks.userFindMany.mockResolvedValue([])
    mocks.paymentFindMany.mockResolvedValue([])
  })

  it('rejects users without admin access', async () => {
    mocks.requireAdmin.mockRejectedValue(new TestAuthError(403, 'Forbidden'))

    const response = await search('ivan@example.com')

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
    expect(mocks.userFindMany).not.toHaveBeenCalled()
    expect(mocks.paymentFindMany).not.toHaveBeenCalled()
  })

  it.each([undefined, '', ' a ', 'x'.repeat(101)])('returns empty results for query %j', async (q) => {
    const response = await search(q)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ users: [], payments: [] })
    expect(mocks.userFindMany).not.toHaveBeenCalled()
    expect(mocks.paymentFindMany).not.toHaveBeenCalled()
  })

  it('searches users and payments with the list page filters', async () => {
    await search('  @ivan  ')

    expect(mocks.userFindMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 6,
      where: {
        OR: expect.arrayContaining([
          { id: { equals: '@ivan' } },
          { email: { contains: '@ivan', mode: 'insensitive' } },
          { name: { contains: '@ivan', mode: 'insensitive' } },
          { remnawaveUsername: { contains: '@ivan', mode: 'insensitive' } },
          { telegramUsername: { contains: 'ivan', mode: 'insensitive' } },
        ]),
      },
    }))
    expect(mocks.paymentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 6,
      where: {
        OR: [
          { id: { equals: '@ivan' } },
          { user: { email: { contains: '@ivan', mode: 'insensitive' } } },
          { user: { name: { contains: '@ivan', mode: 'insensitive' } } },
          { plan: { name: { contains: '@ivan', mode: 'insensitive' } } },
          { yookassaId: { contains: '@ivan', mode: 'insensitive' } },
          { externalPaymentId: { contains: '@ivan', mode: 'insensitive' } },
        ],
      },
    }))
  })

  it('maps users and payments without leaking extra fields', async () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    const past = new Date('2024-01-01T00:00:00.000Z')
    mocks.userFindMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'ivan@example.com',
        name: 'Иван',
        telegramId: BigInt(42),
        telegramUsername: 'ivan',
        subscriptions: [
          { status: 'EXPIRED', expireAt: future, plan: { name: 'Старый' } },
          { status: 'ACTIVE', expireAt: future, plan: { name: 'Год' } },
        ],
      },
      {
        id: 'user-2',
        email: 'telegram-77@pending.invalid',
        name: null,
        telegramId: BigInt(77),
        telegramUsername: null,
        subscriptions: [],
      },
    ])
    mocks.paymentFindMany.mockResolvedValue([
      {
        id: 'payment-1',
        amountKopecks: 29900,
        status: 'SUCCEEDED',
        provider: 'YOOKASSA',
        createdAt: past,
        userId: 'user-3',
        user: { email: 'telegram-5@pending.invalid', telegramId: BigInt(5), telegramUsername: 'buyer' },
        plan: { name: 'Месяц' },
      },
    ])

    const response = await search('ivan')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      users: [
        {
          id: 'user-1',
          label: 'ivan@example.com',
          email: 'ivan@example.com',
          name: 'Иван',
          telegramUsername: 'ivan',
          planName: 'Год',
          subscriptionStatus: 'ACTIVE',
          expireAt: future.toISOString(),
        },
        {
          id: 'user-2',
          label: '@77',
          email: 'telegram-77@pending.invalid',
          name: null,
          telegramUsername: null,
          planName: null,
          subscriptionStatus: null,
          expireAt: null,
        },
      ],
      payments: [
        {
          id: 'payment-1',
          amountKopecks: 29900,
          status: 'SUCCEEDED',
          provider: 'YOOKASSA',
          createdAt: past.toISOString(),
          userId: 'user-3',
          userLabel: '@buyer',
          planName: 'Месяц',
        },
      ],
    })
  })
})
