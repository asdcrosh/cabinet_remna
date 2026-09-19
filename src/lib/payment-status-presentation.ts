import type { PaymentSyncResult } from './payment-sync'

export type PaymentBannerStatus =
  | 'awaiting'
  | 'ready'
  | 'processing'
  | 'verification_error'
  | 'provisioning_error'
  | 'reversal_error'
  | 'canceled'
  | 'not_found'

export type StoredPaymentBannerInput = {
  status: 'PENDING' | 'SUCCEEDED' | 'CANCELED' | 'REFUNDED'
  subscriptionProvisionedAt: Date | string | null
  provisioningError: string | null
  provisioningJob?: { status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' } | null
}

export function getPaymentBannerStatus(result: PaymentSyncResult | null): PaymentBannerStatus {
  if (!result) return 'processing'
  if (result.status === 'not_found') return 'not_found'
  if (result.status === 'canceled') return 'canceled'
  if (result.status === 'pending' || result.status === 'missing_external_id') return 'awaiting'
  if (result.status === 'provisioning_pending') return 'processing'
  if (result.status === 'succeeded' && result.provisioned) return 'ready'
  if (result.status === 'check_failed') return 'verification_error'
  if (result.status === 'provisioning_failed') return 'provisioning_error'
  if (result.status === 'reversal_failed') return 'reversal_error'
  return 'processing'
}

export function getStoredPaymentBannerStatus(payment: StoredPaymentBannerInput | null): PaymentBannerStatus {
  if (!payment) return 'not_found'
  if (payment.status === 'CANCELED' || payment.status === 'REFUNDED') return 'canceled'
  if (payment.status === 'PENDING') {
    return payment.provisioningError ? 'verification_error' : 'awaiting'
  }
  if (payment.subscriptionProvisionedAt || payment.provisioningJob?.status === 'SUCCEEDED') return 'ready'
  if (payment.provisioningJob?.status === 'FAILED') return 'provisioning_error'
  return 'processing'
}
