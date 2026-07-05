import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(),
  paymentUpdate: vi.fn(),
  userUpdate: vi.fn(),
  remnashopQuery: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    payment: {
      findUnique: mocks.paymentFindUnique,
      update: mocks.paymentUpdate,
    },
    user: {
      update: mocks.userUpdate,
    },
  },
}))

vi.mock('./remnashop-db', () => ({
  remnashopQuery: mocks.remnashopQuery,
}))

vi.mock('./logger', () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}))

vi.mock('./sync-events', () => ({
  markSyncFailed: vi.fn(),
  markSyncSkipped: vi.fn(),
  markSyncSucceeded: vi.fn(),
}))

import { syncCabinetPaymentToRemnashop } from './remnashop-reverse-sync'

const originalDatabaseUrl = process.env.REMNASHOP_DATABASE_URL

const payment = {
  id: 'pay-1',
  status: 'SUCCEEDED',
  amountKopecks: 30000,
  originalAmountKopecks: 30000,
  discountKopecks: 0,
  discountPercent: null,
  promoCodeSnapshot: null,
  yookassaId: 'yk-1',
  paidAt: new Date('2026-07-04T10:00:00.000Z'),
  createdAt: new Date('2026-07-04T09:59:00.000Z'),
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    emailVerifiedAt: new Date('2026-07-04T09:00:00.000Z'),
    telegramId: null,
    telegramUsername: null,
    remnashopUserId: 10,
    remnawaveUuid: 'remna-uuid',
  },
  plan: {
    id: 'plan-1',
    name: 'Стандарт',
    remnashopPlanId: 77,
    durationDays: 30,
    trafficLimitGb: 0,
    deviceLimit: 3,
    activeInternalSquads: ['squad-1'],
  },
  subscription: {
    id: 'sub-1',
    status: 'ACTIVE',
    startAt: new Date('2026-07-04T10:00:00.000Z'),
    expireAt: new Date('2026-08-03T10:00:00.000Z'),
  },
}

describe('remnashop reverse sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://remnashop'
    mocks.paymentFindUnique.mockResolvedValue(payment)
    mocks.paymentUpdate.mockResolvedValue({})
    mocks.userUpdate.mockResolvedValue({})
    mocks.remnashopQuery.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.includes('information_schema.columns') && values[0] === 'subscriptions') {
        return {
          rows: [
            'id',
            'user_id',
            'plan_id',
            'user_remna_id',
            'status',
            'is_trial',
            'internal_squads',
            'expire_at',
            'traffic_limit',
            'device_limit',
            'plan_snapshot',
            'created_at',
            'updated_at',
          ].map((column_name) => ({ column_name })),
        }
      }
      if (sql.includes('information_schema.columns') && values[0] === 'transactions') {
        return {
          rows: [
            'id',
            'user_id',
            'subscription_id',
            'plan_id',
            'payment_id',
            'status',
            'gateway_type',
            'purchase_type',
            'currency',
            'amount',
            'pricing',
            'created_at',
            'updated_at',
          ].map((column_name) => ({ column_name })),
        }
      }
      if (sql.includes('information_schema.columns') && values[0] === 'users') {
        return { rows: [{ column_name: 'current_subscription_id' }] }
      }
      if (sql.includes('FROM "subscriptions"') || sql.includes('FROM "transactions"')) {
        return { rows: [] }
      }
      if (sql.includes('INSERT INTO "subscriptions"')) {
        return { rows: [{ id: '100' }] }
      }
      if (sql.includes('INSERT INTO "transactions"')) {
        return { rows: [{ id: '200' }] }
      }
      return { rows: [] }
    })
  })

  afterEach(() => {
    if (originalDatabaseUrl == null) delete process.env.REMNASHOP_DATABASE_URL
    else process.env.REMNASHOP_DATABASE_URL = originalDatabaseUrl
  })

  it('writes required Remnashop subscription flags', async () => {
    await expect(syncCabinetPaymentToRemnashop('pay-1')).resolves.toMatchObject({
      ok: true,
      remnashopSubscriptionId: 100,
      remnashopTransactionId: 200,
    })

    const subscriptionInsert = mocks.remnashopQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO "subscriptions"')
    )
    expect(subscriptionInsert?.[0]).toContain('"is_trial"')
    expect(subscriptionInsert?.[1]).toContain(false)
    expect(subscriptionInsert?.[0]).toContain('"internal_squads"')
    expect(subscriptionInsert?.[1]).toContainEqual(['squad-1'])
  })
})
