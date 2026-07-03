export function toRemnawaveTelegramId(value: bigint | number | null | undefined) {
  if (value == null) return undefined
  if (typeof value === 'bigint') {
    if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) return undefined
    return Number(value)
  }
  return Number.isSafeInteger(value) && value > 0 ? value : undefined
}
