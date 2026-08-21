import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  syncPromo: vi.fn(),
  markSyncSkipped: vi.fn(),
  markSyncPending: vi.fn(),
  markSyncSucceeded: vi.fn(),
  markSyncFailed: vi.fn(),
  syncEventFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  syncLinkedTelegramUser: vi.fn(),
}))

vi.mock('./admin-notifications', () => ({ createAdminNotification: vi.fn() }))
vi.mock('./prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    syncEvent: {
      findMany: mocks.syncEventFindMany,
    },
  },
}))
vi.mock('./remnashop-promo-sync', () => ({
  deactivateCabinetPromoCodesInRemnashop: vi.fn(),
  isRemnashopPromoSyncUnavailableReason: (reason: string) =>
    reason === 'remnashop promo code table is not writable',
  isRemnashopPromoLocalOnlyReason: (reason: string) =>
    reason === 'current remnashop does not support personal email audience for discount promocodes',
  syncCabinetPromoCodeToRemnashop: mocks.syncPromo,
}))
vi.mock('./remnashop-reverse-sync', () => ({ syncCabinetPaymentToRemnashop: vi.fn() }))
vi.mock('./remnashop-sync', () => ({
  syncRemnashopCatalog: vi.fn(),
  syncRemnashopPaymentsToCabinet: vi.fn(),
}))
vi.mock('./remnashop-users', () => ({ syncRemnashopUserBySourceId: vi.fn() }))
vi.mock('./telegram-link-sync', () => ({
  syncLinkedTelegramUser: mocks.syncLinkedTelegramUser,
}))
vi.mock('./sync-events', () => ({
  markSyncFailed: mocks.markSyncFailed,
  markSyncPending: mocks.markSyncPending,
  markSyncSkipped: mocks.markSyncSkipped,
  markSyncSucceeded: mocks.markSyncSucceeded,
}))

import { retryDueRemnashopSyncEvents, retryRemnashopSyncEvent } from './remnashop-retry'

const promoEvent = {
  direction: 'CABINET_TO_REMNASHOP' as const,
  entityType: 'promoCode',
  entityId: 'promo-1',
  operation: 'upsert',
}
const originalDatabaseUrl = process.env.REMNASHOP_DATABASE_URL

describe('Remnashop sync retries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://remnashop@db/remnashop'
  })

  it('collapses missing promo write access into one configuration issue', async () => {
    mocks.syncPromo.mockResolvedValue({
      ok: false,
      skipped: 'remnashop promo code table is not writable',
    })

    await expect(retryRemnashopSyncEvent(promoEvent)).resolves.toMatchObject({ ok: false })
    expect(mocks.markSyncSkipped).toHaveBeenCalledWith({
      direction: 'CABINET_TO_REMNASHOP',
      entityType: 'promoCodeConfig',
      entityId: 'remnashop',
      operation: 'check',
    }, 'remnashop promo code table is not writable')
  })

  it('does not retry a personal Cabinet-only promo forever', async () => {
    mocks.syncPromo.mockResolvedValue({
      ok: false,
      skipped: 'current remnashop does not support personal email audience for discount promocodes',
    })

    await expect(retryRemnashopSyncEvent(promoEvent)).resolves.toMatchObject({ ok: false })
    expect(mocks.markSyncSkipped).not.toHaveBeenCalled()
  })

  it('retries a failed Telegram identity sync without creating a nested sync event', async () => {
    mocks.userFindUnique.mockResolvedValue({ telegramId: 123n })
    mocks.syncLinkedTelegramUser.mockResolvedValue({
      alreadyRunning: false,
      warnings: [],
    })

    await expect(retryRemnashopSyncEvent({
      direction: 'REMNASHOP_TO_CABINET',
      entityType: 'telegramIdentity',
      entityId: 'user-1',
      operation: 'sync',
    })).resolves.toMatchObject({ alreadyRunning: false })
    expect(mocks.syncLinkedTelegramUser).toHaveBeenCalledWith({
      localUserId: 'user-1',
      telegramId: 123n,
    }, { trackEvent: false })
  })

  it('stops retrying a Telegram identity that has no Remnashop subscription', async () => {
    mocks.syncEventFindMany.mockResolvedValue([{
      direction: 'REMNASHOP_TO_CABINET',
      entityType: 'telegramIdentity',
      entityId: 'user-1',
      operation: 'sync',
      attempts: 300,
      metadata: null,
    }])
    mocks.userFindUnique.mockResolvedValue({ telegramId: 123n })
    mocks.syncLinkedTelegramUser.mockResolvedValue({
      alreadyRunning: false,
      warnings: [],
      skipped: 'У пользователя Remnashop нет подписки; профиль Remnawave пока не требуется.',
    })

    await expect(retryDueRemnashopSyncEvents({ force: true })).resolves.toEqual({
      attempted: 1,
      succeeded: 1,
      failed: 0,
    })
    expect(mocks.markSyncSkipped).toHaveBeenCalledWith({
      direction: 'REMNASHOP_TO_CABINET',
      entityType: 'telegramIdentity',
      entityId: 'user-1',
      operation: 'sync',
    }, 'У пользователя Remnashop нет подписки; профиль Remnawave пока не требуется.')
    expect(mocks.markSyncSucceeded).not.toHaveBeenCalled()
    expect(mocks.markSyncFailed).not.toHaveBeenCalled()
  })
})

afterAll(() => {
  if (originalDatabaseUrl === undefined) delete process.env.REMNASHOP_DATABASE_URL
  else process.env.REMNASHOP_DATABASE_URL = originalDatabaseUrl
})
