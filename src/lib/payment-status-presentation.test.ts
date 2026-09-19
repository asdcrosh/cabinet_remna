import { describe, expect, it } from 'vitest'
import { getPaymentBannerStatus, getStoredPaymentBannerStatus } from './payment-status-presentation'

describe('payment status presentation', () => {
  it('does not present a provider check failure as a received payment', () => {
    expect(getPaymentBannerStatus({
      ok: false,
      status: 'check_failed',
      provisioned: false,
      error: 'provider timeout',
    })).toBe('verification_error')
  })

  it('distinguishes confirmed payment with failed provisioning', () => {
    expect(getPaymentBannerStatus({
      ok: false,
      status: 'provisioning_failed',
      provisioned: false,
      error: 'Remnawave timeout',
    })).toBe('provisioning_error')
  })

  it('distinguishes a failed access reversal from payment verification', () => {
    expect(getPaymentBannerStatus({
      ok: false,
      status: 'reversal_failed',
      provisioned: false,
      error: 'Remnawave timeout',
    })).toBe('reversal_error')
  })

  it('maps terminal and pending states', () => {
    expect(getPaymentBannerStatus(null)).toBe('processing')
    expect(getPaymentBannerStatus({ ok: true, status: 'pending', provisioned: false })).toBe('awaiting')
    expect(getPaymentBannerStatus({ ok: true, status: 'canceled', provisioned: false })).toBe('canceled')
    expect(getPaymentBannerStatus({ ok: true, status: 'not_found', provisioned: false })).toBe('not_found')
    expect(getPaymentBannerStatus({ ok: true, status: 'succeeded', provisioned: true })).toBe('ready')
  })

  it('reads polling state from local payment and provisioning records', () => {
    expect(getStoredPaymentBannerStatus(null)).toBe('not_found')
    expect(getStoredPaymentBannerStatus({
      status: 'PENDING',
      subscriptionProvisionedAt: null,
      provisioningError: null,
    })).toBe('awaiting')
    expect(getStoredPaymentBannerStatus({
      status: 'PENDING',
      subscriptionProvisionedAt: null,
      provisioningError: 'provider timeout',
    })).toBe('verification_error')
    expect(getStoredPaymentBannerStatus({
      status: 'SUCCEEDED',
      subscriptionProvisionedAt: null,
      provisioningError: 'Remnawave timeout',
      provisioningJob: { status: 'FAILED' },
    })).toBe('provisioning_error')
    expect(getStoredPaymentBannerStatus({
      status: 'SUCCEEDED',
      subscriptionProvisionedAt: new Date(),
      provisioningError: null,
    })).toBe('ready')
  })
})
