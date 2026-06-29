export type FeatureFlags = {
  referrals: boolean
  bonusBox: boolean
  support: boolean
  broadcasts: boolean
  giftCertificates: boolean
}

export function getFeatureFlags(): FeatureFlags {
  return {
    referrals: envFlag('FEATURE_REFERRALS', true),
    bonusBox: envFlag('FEATURE_BONUS_BOX', true),
    support: envFlag('FEATURE_SUPPORT', true),
    broadcasts: envFlag('FEATURE_BROADCASTS', true),
    giftCertificates: envFlag('FEATURE_GIFT_CERTIFICATES', true),
  }
}

function envFlag(name: string, defaultValue: boolean) {
  const value = process.env[name]
  if (value == null || value === '') return defaultValue
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase())
}
