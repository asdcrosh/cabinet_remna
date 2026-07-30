import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  syncPromo: vi.fn(),
  markSyncSkipped: vi.fn(),
  userFindUnique: vi.fn(),
  syncLinkedTelegramUser: vi.fn(),
}))

vi.mock('./admin-notifications', () => ({ createAdminNotification: vi.fn() }))
vi.mock('./prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
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
  markSyncFailed: vi.fn(),
  markSyncPending: vi.fn(),
  markSyncSkipped: mocks.markSyncSkipped,
  markSyncSucceeded: vi.fn(),
}))

import { retryRemnashopSyncEvent } from './remnashop-retry'

const promoEvent = {
  direction: 'CABINET_TO_REMNASHOP' as const,
  entityType: 'promoCode',
  entityId: 'promo-1',
  operation: 'upsert',
}

describe('Remnashop sync retries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
