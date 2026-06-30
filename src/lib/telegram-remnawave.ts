export function toRemnawaveTelegramId(value: bigint | number | null | undefined) {
  if (value == null) return undefined
  if (typeof value === 'bigint') return value > 0n ? value.toString() : undefined
  return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined
}
