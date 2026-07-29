import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  promoCodeFindUnique: vi.fn(),
  remnashopQuery: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    promoCode: {
      findUnique: mocks.promoCodeFindUnique,
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

import { syncCabinetPromoCodeToRemnashop } from './remnashop-promo-sync'

const originalDatabaseUrl = process.env.REMNASHOP_DATABASE_URL

const promoCode = {
  id: 'promo-1',
  code: 'HELLO20',
  discountPercent: 20,
  audience: 'ALL',
  allowedEmails: [],
  isActive: true,
  startsAt: null,
  expiresAt: new Date('2026-08-31T21:00:00.000Z'),
  maxUses: 100,
  maxUsesPerUser: 1,
  createdAt: new Date('2026-07-01T10:00:00.000Z'),
  updatedAt: new Date('2026-07-01T10:00:00.000Z'),
  plans: [],
}

describe('remnashop promo sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://remnashop'
    mocks.promoCodeFindUnique.mockResolvedValue(promoCode)
    mocks.remnashopQuery.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.includes('information_schema.tables')) {
        const candidates = values[0] as string[]
        return candidates.includes('promocodes')
          ? { rows: [{ table_name: 'promocodes' }] }
          : { rows: [] }
      }
      if (sql.includes('information_schema.columns')) {
        return {
          rows: [
            'id',
            'code',
            'is_active',
            'reward_type',
            'reward',
            'plan_snapshot',
            'availability',
            'expires_at',
            'max_activations',
            'is_reusable',
            'created_at',
            'updated_at',
          ].map((column_name) => ({ column_name })),
        }
      }
      if (sql.includes('has_table_privilege')) {
        return { rows: [{ can_insert: true, can_update: true }] }
      }
      if (sql.includes('SELECT "id"::text AS id')) return { rows: [] }
      if (sql.includes('INSERT INTO "promocodes"')) return { rows: [{ id: '42' }] }
      return { rows: [] }
    })
  })

  afterEach(() => {
    if (originalDatabaseUrl == null) delete process.env.REMNASHOP_DATABASE_URL
    else process.env.REMNASHOP_DATABASE_URL = originalDatabaseUrl
  })

  it('writes current Remnashop purchase discount fields', async () => {
    await expect(syncCabinetPromoCodeToRemnashop('promo-1')).resolves.toEqual({
      ok: true,
      remnashopPromoCodeId: '42',
    })

    const insert = mocks.remnashopQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO "promocodes"')
    )
    expect(insert?.[0]).toContain('"reward_type"')
    expect(insert?.[0]).toContain('"max_activations"')
    expect(insert?.[1]).toContain('PURCHASE_DISCOUNT')
    expect(insert?.[1]).toContain(20)
    expect(insert?.[1]).toContain(100)
  })

  it('does not broaden a personal promo to all Remnashop users', async () => {
    mocks.promoCodeFindUnique.mockResolvedValue({
      ...promoCode,
      audience: 'PERSONAL',
      allowedEmails: ['person@example.com'],
    })

    await expect(syncCabinetPromoCodeToRemnashop('promo-1')).resolves.toEqual({
      ok: false,
      skipped: 'current remnashop does not support personal email audience for discount promocodes',
    })
    expect(mocks.remnashopQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "promocodes"'),
      expect.anything()
    )
  })
})
