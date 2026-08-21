import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(),
  paymentUpdate: vi.fn(),
  userUpdate: vi.fn(),
  remnashopQuery: vi.fn(),
  getSubscriptionByUsername: vi.fn(),
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

vi.mock('./remnawave', () => ({
  remnawave: {
    getSubscriptionByUsername: mocks.getSubscriptionByUsername,
  },
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
  provider: 'YOOKASSA',
  externalPaymentId: 'yk-1',
  yookassaId: 'yk-1',
  remnashopSyncedAt: null,
  paidAt: new Date('2026-07-04T10:00:00.000Z'),
  createdAt: new Date('2026-07-04T09:59:00.000Z'),
  deviceLimit: 3,
  planSnapshot: null,
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    emailVerifiedAt: new Date('2026-07-04T09:00:00.000Z'),
    telegramId: null,
    telegramUsername: null,
    remnashopUserId: 10,
    remnawaveUuid: 'remna-uuid',
    remnawaveUsername: 'remna-user',
    remnawaveShortUuid: 'remna-short',
  },
  plan: {
    id: 'plan-1',
    name: 'Стандарт',
    remnashopPlanId: 77,
    durationDays: 30,
    priceKopecks: 30000,
    trafficLimitGb: 0,
    deviceLimit: 3,
    maxDeviceLimit: 3,
    extraDevicePriceKopecks: 0,
    activeInternalSquads: ['squad-1'],
  },
  subscription: {
    id: 'sub-1',
    status: 'ACTIVE',
    startAt: new Date('2026-07-04T10:00:00.000Z'),
    expireAt: new Date('2026-08-03T10:00:00.000Z'),
    deviceLimit: 3,
  },
}

describe('remnashop reverse sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://remnashop'
    mocks.paymentFindUnique.mockResolvedValue(payment)
    mocks.paymentUpdate.mockResolvedValue({})
    mocks.userUpdate.mockResolvedValue({})
    mocks.getSubscriptionByUsername.mockResolvedValue({
      response: { subscriptionUrl: 'https://subscription.example/remna-short' },
    })
    mocks.remnashopQuery.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.includes('information_schema.columns') && values[0] === 'subscriptions') {
        return {
          rows: [
            'id',
            'user_id',
            'plan_id',
            'user_remna_id',
            'url',
            'status',
            'is_trial',
            'disabled_by_channel_leave',
            'internal_squads',
            'external_squad',
            'traffic_limit_strategy',
            'tag',
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
            'is_test',
            'gateway_type',
            'gateway_display_name',
            'payment_method',
            'purchase_type',
            'currency',
            'pricing',
            'plan_snapshot',
            'created_at',
            'updated_at',
          ].map((column_name) => ({ column_name })),
        }
      }
      if (sql.includes('information_schema.columns') && values[0] === 'users') {
        return {
          rows: [
            'id',
            'email',
            'is_email_verified',
            'name',
            'username',
            'telegram_id',
            'auth_type',
            'referral_code',
            'role',
            'language',
            'personal_discount',
            'purchase_discount',
            'points',
            'is_blocked',
            'is_bot_blocked',
            'is_rules_accepted',
            'is_trial_available',
            'current_subscription_id',
            'created_at',
            'updated_at',
          ].map((column_name) => ({ column_name })),
        }
      }
      if (sql.includes('information_schema.columns') && values[0] === 'promocodes') {
        return {
          rows: ['id', 'code'].map((column_name) => ({ column_name })),
        }
      }
      if (sql.includes('information_schema.columns') && values[0] === 'promocode_activations') {
        return {
          rows: ['id', 'promocode_id', 'user_id', 'activated_at']
            .map((column_name) => ({ column_name })),
        }
      }
      if (sql.includes('FROM users WHERE')) {
        return { rows: [] }
      }
      if (sql.includes('INSERT INTO "users"')) {
        return { rows: [{ id: '10' }] }
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
    expect(subscriptionInsert?.[0]).toContain('"traffic_limit_strategy"')
    expect(subscriptionInsert?.[1]).toContain('NO_RESET')
    expect(subscriptionInsert?.[0]).toContain('"url"')
    expect(subscriptionInsert?.[1]).toContain('https://subscription.example/remna-short')
  })

  it('fills Remnashop language columns when creating a missing user', async () => {
    mocks.paymentFindUnique.mockResolvedValue({
      ...payment,
      user: {
        ...payment.user,
        remnashopUserId: null,
        telegramId: 123456789n,
      },
    })

    await expect(syncCabinetPaymentToRemnashop('pay-1')).resolves.toMatchObject({
      ok: true,
      remnashopUserId: 10,
    })

    const userInsert = mocks.remnashopQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO "users"')
    )
    expect(userInsert?.[0]).toContain('"language"')
    expect(userInsert?.[1]).toContain('ru')
    expect(userInsert?.[0]).toContain('"auth_type"')
    expect(userInsert?.[1]).toContain('telegram')
    expect(userInsert?.[0]).toContain('"referral_code"')
    expect(userInsert?.[0]).toContain('"is_rules_accepted"')
    expect(userInsert?.[1]).toContain(true)
  })

  it('writes current Remnashop transaction snapshots and gateway fields', async () => {
    await expect(syncCabinetPaymentToRemnashop('pay-1')).resolves.toMatchObject({ ok: true })

    const transactionInsert = mocks.remnashopQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO "transactions"')
    )
    expect(transactionInsert?.[0]).toContain('"is_test"')
    expect(transactionInsert?.[0]).toContain('"gateway_display_name"')
    expect(transactionInsert?.[0]).toContain('"plan_snapshot"')
    expect(transactionInsert?.[1]).toContain('NEW')
    expect(transactionInsert?.[1]).toContainEqual(expect.stringMatching(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    ))
    expect(transactionInsert?.[1]).toContain(JSON.stringify({
      original_amount: 300,
      base_amount: 300,
      selected_device_limit: 3,
      extra_device_count: 0,
      extra_device_price: 0,
      extra_device_amount: 0,
      discount_percent: 0,
      final_amount: 300,
    }))
  })

  it('updates the original transaction when the payment was imported from Remnashop', async () => {
    mocks.paymentFindUnique.mockResolvedValue({
      ...payment,
      externalPaymentId: 'original-remnashop-payment',
      remnashopSyncedAt: new Date('2026-07-04T10:01:00.000Z'),
    })
    mocks.remnashopQuery.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.includes('information_schema.columns') && values[0] === 'subscriptions') {
        return {
          rows: [
            'id', 'user_id', 'plan_id', 'user_remna_id', 'url', 'status', 'is_trial',
            'internal_squads', 'traffic_limit_strategy', 'expire_at', 'traffic_limit',
            'device_limit', 'plan_snapshot', 'created_at', 'updated_at',
          ].map((column_name) => ({ column_name })),
        }
      }
      if (sql.includes('information_schema.columns') && values[0] === 'transactions') {
        return {
          rows: [
            'id', 'user_id', 'subscription_id', 'plan_id', 'payment_id', 'status',
            'gateway_type', 'gateway_display_name', 'purchase_type', 'currency',
            'pricing', 'plan_snapshot', 'created_at', 'updated_at',
          ].map((column_name) => ({ column_name })),
        }
      }
      if (sql.includes('information_schema.columns') && values[0] === 'users') {
        return { rows: ['id', 'current_subscription_id'].map((column_name) => ({ column_name })) }
      }
      if (sql.includes('information_schema.columns')) return { rows: [] }
      if (sql.includes('FROM subscriptions s')) return { rows: [{ id: '100' }] }
      if (sql.includes('FROM transactions WHERE payment_id::text = $1')) {
        return values[0] === 'original-remnashop-payment'
          ? { rows: [{ id: '200' }] }
          : { rows: [] }
      }
      return { rows: [] }
    })

    await expect(syncCabinetPaymentToRemnashop('pay-1')).resolves.toMatchObject({
      ok: true,
      remnashopTransactionId: 200,
    })

    const transactionUpdate = mocks.remnashopQuery.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE "transactions"')
    )
    expect(transactionUpdate?.[1]).toContain('original-remnashop-payment')
    expect(mocks.remnashopQuery.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO "transactions"')
    )).toBe(false)
  })

  it('reuses the current Remnashop legacy UUID for a Remnawave v3 user', async () => {
    mocks.paymentFindUnique.mockResolvedValue({
      ...payment,
      user: {
        ...payment.user,
        remnawaveUuid: null,
        remnawaveUsername: 'remna-v3-user',
      },
    })
    mocks.remnashopQuery.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.includes('information_schema.columns') && values[0] === 'subscriptions') {
        return {
          rows: [
            'id', 'user_id', 'plan_id', 'user_remna_id', 'url', 'status', 'is_trial',
            'internal_squads', 'traffic_limit_strategy', 'expire_at', 'traffic_limit',
            'device_limit', 'plan_snapshot', 'created_at', 'updated_at',
          ].map((column_name) => ({ column_name })),
        }
      }
      if (sql.includes('information_schema.columns') && values[0] === 'transactions') {
        return {
          rows: [
            'id', 'user_id', 'subscription_id', 'plan_id', 'payment_id', 'status',
            'gateway_type', 'gateway_display_name', 'purchase_type', 'currency',
            'pricing', 'plan_snapshot', 'created_at', 'updated_at',
          ].map((column_name) => ({ column_name })),
        }
      }
      if (sql.includes('information_schema.columns') && values[0] === 'users') {
        return { rows: ['id', 'current_subscription_id'].map((column_name) => ({ column_name })) }
      }
      if (sql.includes('information_schema.columns')) return { rows: [] }
      if (sql.includes('AS remnawave_uuid')) {
        return { rows: [{ remnawave_uuid: 'legacy-remnashop-uuid' }] }
      }
      if (sql.includes('FROM subscriptions s')) return { rows: [{ id: '100' }] }
      if (sql.includes('FROM transactions WHERE payment_id::text = $1')) {
        return { rows: [{ id: '200' }] }
      }
      return { rows: [] }
    })

    await expect(syncCabinetPaymentToRemnashop('pay-1')).resolves.toMatchObject({
      ok: true,
      remnashopSubscriptionId: 100,
      remnashopTransactionId: 200,
    })

    const subscriptionLookup = mocks.remnashopQuery.mock.calls.find(([sql]) =>
      String(sql).includes('FROM subscriptions s') && String(sql).includes('user_remna_id::text = $2')
    )
    expect(subscriptionLookup?.[1]).toEqual([10, 'legacy-remnashop-uuid'])

    const subscriptionUpdate = mocks.remnashopQuery.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE "subscriptions"')
    )
    expect(subscriptionUpdate?.[1]).toContain('legacy-remnashop-uuid')
  })

  it('records promo activation without relying on a missing database constraint', async () => {
    mocks.paymentFindUnique.mockResolvedValue({
      ...payment,
      promoCodeSnapshot: { code: 'HELLO20' },
    })

    await expect(syncCabinetPaymentToRemnashop('pay-1')).resolves.toMatchObject({ ok: true })

    const activationInsert = mocks.remnashopQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO promocode_activations')
    )
    expect(activationInsert?.[0]).toContain('NOT EXISTS')
    expect(activationInsert?.[0]).not.toContain('ON CONFLICT')
  })
})
