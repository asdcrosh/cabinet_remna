export function buildPaymentServiceName(durationDays: number) {
  if (!Number.isSafeInteger(durationDays) || durationDays <= 0) {
    throw new Error('Payment service duration must be a positive integer')
  }

  return `Доступ к цифровому сервису на ${durationDays} дн.`
}
