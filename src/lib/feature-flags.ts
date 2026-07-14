export type FeatureFlags = {
  referrals: boolean
  bonusBox: boolean
  support: boolean
  broadcasts: boolean
}

export function getFeatureFlags(): FeatureFlags {
  return {
    referrals: envFlag('FEATURE_REFERRALS', true),
    bonusBox: envFlag('BONUS_BOX_ENABLED', true),
    support: envFlag('FEATURE_SUPPORT', true),
    broadcasts: envFlag('FEATURE_BROADCASTS', true),
  }
}

export function isFeatureEnabled(feature: keyof FeatureFlags) {
  return getFeatureFlags()[feature]
}

function envFlag(name: string, defaultValue: boolean) {
  const value = process.env[name]
  if (value == null || value === '') return defaultValue
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase())
}
