export function toRemnawaveTelegramId(value: bigint | number | null | undefined) {
  if (value == null) return undefined
  const id = typeof value === 'bigint' ? Number(value) : value
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}
