export function buildPaymentServiceName(durationDays: number, unlimitedDuration = false) {
  if (!Number.isSafeInteger(durationDays) || durationDays <= 0) {
    throw new Error('Payment service duration must be a positive integer')
  }

  return unlimitedDuration
    ? 'Бессрочный доступ к цифровому сервису'
    : `Доступ к цифровому сервису на ${durationDays} дн.`
}
