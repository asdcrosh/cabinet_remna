export const TERMS_VERSION = '2026-07-18'
export const PRIVACY_POLICY_VERSION = '2026-07-18'
export const PERSONAL_DATA_CONSENT_VERSION = '2026-07-18'
export const LEGAL_UPDATED_AT = '18 июля 2026 года'

export function getLegalDetails() {
  return {
    operatorName: process.env.LEGAL_OPERATOR_NAME?.trim() || 'Оператор сервиса',
    taxId: process.env.LEGAL_OPERATOR_TAX_ID?.trim() || 'не указан',
    address: process.env.LEGAL_OPERATOR_ADDRESS?.trim() || null,
    supportEmail: process.env.LEGAL_SUPPORT_EMAIL?.trim() || 'support@example.com',
    supportPhone: process.env.LEGAL_SUPPORT_PHONE?.trim() || null,
    supportTelegram: normalizeTelegram(process.env.LEGAL_SUPPORT_TELEGRAM),
  }
}

function normalizeTelegram(value: string | undefined) {
  const username = value?.trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '')
  return username ? `@${username}` : null
}
