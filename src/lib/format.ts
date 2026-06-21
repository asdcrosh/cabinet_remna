// Форматирование байтов в человекочитаемый вид.
// Используем 1024 (бинарная), как принято в UI Remnawave.
export function formatBytes(bytes: bigint | number, decimals = 2): string {
  const b = typeof bytes === 'bigint' ? Number(bytes) : bytes
  if (!b || b <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), sizes.length - 1)
  const v = b / Math.pow(k, i)
  return `${v.toFixed(decimals)} ${sizes[i]}`
}

// 1.5 ГБ -> 1610612736
export function gbToBytes(gb: number): bigint {
  return BigInt(Math.round(gb * 1024 * 1024 * 1024))
}

// 1610612736 -> 1.5 GB
export function bytesToGb(bytes: bigint | number): number {
  const b = typeof bytes === 'bigint' ? Number(bytes) : bytes
  return Math.round((b / (1024 * 1024 * 1024)) * 100) / 100
}

// Копейки -> "199.00 ₽"
export function formatPrice(kopecks: number, currency = '₽'): string {
  return `${(kopecks / 100).toFixed(2)} ${currency}`
}
