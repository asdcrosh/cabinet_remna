export function getLegalDetails() {
  return {
    operatorName: process.env.LEGAL_OPERATOR_NAME?.trim() || 'Оператор сервиса',
    taxId: process.env.LEGAL_OPERATOR_TAX_ID?.trim() || 'не указан',
    address: process.env.LEGAL_OPERATOR_ADDRESS?.trim() || 'не указан',
    supportEmail: process.env.LEGAL_SUPPORT_EMAIL?.trim() || 'support@example.com',
  }
}
