import { describe, expect, it } from 'vitest'
import { serializePayment, serializeSubscription } from './api-serializers'

describe('api serializers', () => {
  it('serializes subscription BigInt fields as strings', () => {
    const subscription = serializeSubscription({
      id: 'sub-1',
      userId: 'user-1',
      planId: 'plan-1',
      planManagedByCabinet: true,
      startAt: new Date('2026-01-01T00:00:00.000Z'),
      expireAt: new Date('2026-02-01T00:00:00.000Z'),
      status: 'ACTIVE',
      trafficLimitBytes: 1000n,
      trafficUsedBytes: 250n,
      lifetimeUsedBytes: 500n,
      deviceLimit: 5,
      lastSyncedAt: new Date('2026-01-02T00:00:00.000Z'),
      pendingSync: false,
      whitelistAddonActive: false,
      whitelistAddonActivatedAt: null,
      whitelistAddonExpireAt: null,
      whitelistAddonPaymentId: null,
      whitelistAddonInternalSquads: [],
      graceStartedAt: null,
      graceExpireAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      plan: null,
    })

    expect(subscription?.trafficLimitBytes).toBe('1000')
    expect(subscription?.trafficUsedBytes).toBe('250')
    expect(subscription?.lifetimeUsedBytes).toBe('500')
    expect(subscription).not.toHaveProperty('whitelistAddonInternalSquads')
    expect(subscription).not.toHaveProperty('planManagedByCabinet')
  })

  it('serializes payment relations safely', () => {
    const payment = serializePayment({
      id: 'pay-1',
      userId: 'user-1',
      subscriptionId: null,
      planId: 'plan-1',
      promoCodeId: null,
      autoRenewalId: null,
      autoRenewalConsentAcceptedAt: null,
      autoRenewalConsentVersion: null,
      origin: 'MANUAL',
      amountKopecks: 19900,
      originalAmountKopecks: 19900,
      discountPercent: null,
      discountKopecks: 0,
      userDiscountType: null,
      promoCodeSnapshot: null,
      deviceLimit: 5,
      planSnapshot: null,
      addonSnapshot: null,
      purchaseType: 'SUBSCRIPTION',
      provider: 'YOOKASSA',
      externalPaymentId: 'yk-1',
      providerStatus: 'succeeded',
      checkoutKey: null,
      yookassaId: 'yk-1',
      yookassaStatus: 'succeeded',
      confirmationUrl: null,
      status: 'SUCCEEDED',
      paidAt: new Date('2026-01-01T00:00:00.000Z'),
      subscriptionProvisionedAt: null,
      provisioningError: null,
      remnashopSyncedAt: null,
      remnashopSyncError: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      plan: null,
      subscription: null,
    })

    expect(payment.subscription).toBeNull()
    expect(payment.plan).toBeNull()
    expect(payment).not.toHaveProperty('checkoutKey')
  })
})
