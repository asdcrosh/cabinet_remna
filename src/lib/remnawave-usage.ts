export function readRemnawaveBigInt(source: object, keys: string[]) {
  const record = source as Record<string, unknown>

  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'bigint') return value
    if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value))
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) return BigInt(value.trim())
  }

  return 0n
}
