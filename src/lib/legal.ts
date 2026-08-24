export const TERMS_VERSION = '2026-08-19'
export const PRIVACY_POLICY_VERSION = '2026-07-18'
export const PERSONAL_DATA_CONSENT_VERSION = '2026-07-18'
export const OFFER_VERSION = '2026-08-19'
export const LEGAL_UPDATED_AT = '19 августа 2026 года'
export const OFFER_UPDATED_AT = '19 августа 2026 года'

export function getLegalDetails() {
  return {
    operatorName: requiredLegalEnv('LEGAL_OPERATOR_NAME'),
    taxId: requiredLegalEnv('LEGAL_OPERATOR_TAX_ID'),
    address: process.env.LEGAL_OPERATOR_ADDRESS?.trim() || null,
    supportEmail: getMainAdminEmail(),
    supportPhone: process.env.LEGAL_SUPPORT_PHONE?.trim() || null,
    supportTelegram: normalizeTelegram(process.env.LEGAL_SUPPORT_TELEGRAM),
  }
}

function requiredLegalEnv(name: 'LEGAL_OPERATOR_NAME' | 'LEGAL_OPERATOR_TAX_ID') {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function getMainAdminEmail() {
  const email = process.env.SUPERUSER_EMAIL?.trim().toLowerCase()
  if (!email) throw new Error('SUPERUSER_EMAIL is required')
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(email)) {
    throw new Error('SUPERUSER_EMAIL must be a valid email')
  }
  return email
}

function normalizeTelegram(value: string | undefined) {
  const username = value?.trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '')
  return username ? `@${username}` : null
}
