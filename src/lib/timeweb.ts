const TIMEWEB_BASE_URL = 'https://api.timeweb.cloud/api/v1'

export class TimewebError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message)
    this.name = 'TimewebError'
  }
}

interface TimewebDnsRecord {
  id: number | string
  type?: string
  value?: string
  data?: {
    type?: string
    value?: string
  }
}

interface TimewebDnsRecordsResponse {
  dns_records?: TimewebDnsRecord[]
}

interface TimewebDnsRecordResponse {
  dns_record?: TimewebDnsRecord
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = process.env.TIMEWEB_API_TOKEN?.trim()
  if (!token) throw new TimewebError(0, null, 'TIMEWEB_API_TOKEN is not configured')
  const response = await fetch(`${TIMEWEB_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  const text = await response.text()
  const data = text ? safeJson(text) : null
  if (!response.ok) {
    throw new TimewebError(response.status, data, `Timeweb ${method} ${path} returned ${response.status}`)
  }
  return data as T
}

export async function upsertTimewebARecord(fqdn: string, serverIp: string) {
  const encoded = encodeURIComponent(fqdn)
  const existing = await request<TimewebDnsRecordsResponse>('GET', `/domains/${encoded}/dns-records?limit=100&offset=0`)
  const records = existing.dns_records || []
  const conflictingRecords = records.filter((record) => ['AAAA', 'CNAME'].includes(recordType(record)))
  if (conflictingRecords.length > 0) {
    throw new TimewebError(409, conflictingRecords, `Conflicting AAAA or CNAME record already exists for ${fqdn}`)
  }
  const aRecords = records.filter((record) => recordType(record) === 'A')
  const exact = aRecords.find((record) => recordValue(record) === serverIp)
  if (exact) return { id: String(exact.id), created: false }

  if (aRecords.length > 1) {
    throw new TimewebError(409, aRecords, `Multiple A records already exist for ${fqdn}`)
  }

  if (aRecords[0]) {
    const updated = await request<TimewebDnsRecordResponse>(
      'PATCH',
      `/domains/${encoded}/dns-records/${encodeURIComponent(String(aRecords[0].id))}`,
      { type: 'A', value: serverIp }
    )
    return { id: String(updated.dns_record?.id ?? aRecords[0].id), created: false }
  }

  const created = await request<TimewebDnsRecordResponse>(
    'POST',
    `/domains/${encoded}/dns-records`,
    { type: 'A', value: serverIp }
  )
  if (created.dns_record?.id == null) throw new TimewebError(502, created, 'Timeweb response has no DNS record id')
  return { id: String(created.dns_record.id), created: true }
}

function recordType(record: TimewebDnsRecord) {
  return String(record.type ?? record.data?.type ?? '').toUpperCase()
}

function recordValue(record: TimewebDnsRecord) {
  return String(record.value ?? record.data?.value ?? '')
}

function safeJson(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
