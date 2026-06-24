export interface TrafficSeriesPoint {
  date: string
  bytes: string
}

export function normalizeUsageSeries(value: unknown): TrafficSeriesPoint[] {
  const rows = findUsageRows(value)
  const totals = new Map<string, bigint>()

  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const record = row as Record<string, unknown>
    const date = normalizeDate(
      record.date ??
      record.day ??
      record.timestamp ??
      record.createdAt ??
      record.created_at
    )
    if (!date) continue

    const bytes = readBytes(record)
    totals.set(date, (totals.get(date) ?? 0n) + bytes)
  }

  return Array.from(totals.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, bytes]) => ({ date, bytes: bytes.toString() }))
}

function findUsageRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  for (const key of ['records', 'series', 'data', 'items', 'usage']) {
    if (Array.isArray(record[key])) return record[key] as unknown[]
  }
  return []
}

function readBytes(record: Record<string, unknown>) {
  const direct = firstBigInt(record, [
    'bytes',
    'totalBytes',
    'total_bytes',
    'trafficUsedBytes',
    'traffic_used_bytes',
    'usageBytes',
    'usage_bytes',
  ])
  if (direct !== null) return direct

  const upload = firstBigInt(record, ['uploadBytes', 'upload_bytes', 'uplink', 'upload']) ?? 0n
  const download = firstBigInt(record, ['downloadBytes', 'download_bytes', 'downlink', 'download']) ?? 0n
  return upload + download
}

function firstBigInt(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'bigint') return value
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return BigInt(Math.trunc(value))
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) return BigInt(value.trim())
  }
  return null
}

function normalizeDate(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}
