export interface TrafficSeriesPoint {
  date: string
  bytes: string
}

export function hasTrafficUsage(series: TrafficSeriesPoint[]) {
  return series.some((point) => {
    const value = point.bytes.trim()
    return /^\d+$/.test(value) && BigInt(value) > 0n
  })
}

export function normalizeUsageSeries(
  value: unknown,
  range?: { start: Date; end: Date }
): TrafficSeriesPoint[] {
  const currentSeries = readCurrentUsageSeries(value)
  if (currentSeries.length > 0) return currentSeries

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

  if (range) {
    for (const date of enumerateUtcDays(range.start, range.end)) {
      if (!totals.has(date)) totals.set(date, 0n)
    }
  }

  return Array.from(totals.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, bytes]) => ({ date, bytes: bytes.toString() }))
}

function readCurrentUsageSeries(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const root = value as Record<string, unknown>
  const payload = root.response && typeof root.response === 'object' && !Array.isArray(root.response)
    ? root.response as Record<string, unknown>
    : root
  const categories = payload.categories
  const sparklineData = payload.sparklineData

  if (!Array.isArray(categories) || !Array.isArray(sparklineData)) return []

  return categories.flatMap((rawDate, index) => {
    const date = normalizeDate(rawDate)
    const rawBytes = sparklineData[index]
    if (!date || typeof rawBytes !== 'number' || !Number.isFinite(rawBytes) || rawBytes < 0) return []
    return [{ date, bytes: BigInt(Math.trunc(rawBytes)).toString() }]
  })
}

function findUsageRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  if (Array.isArray(record.response)) return record.response
  if (record.response && typeof record.response === 'object') {
    const nested = findUsageRows(record.response)
    if (nested.length > 0) return nested
  }
  for (const key of ['records', 'series', 'data', 'items', 'usage']) {
    if (Array.isArray(record[key])) return record[key] as unknown[]
  }
  return []
}

function enumerateUtcDays(start: Date, end: Date) {
  const dates: string[] = []
  const cursor = new Date(Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate()
  ))
  const last = new Date(Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate()
  ))

  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return dates
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
