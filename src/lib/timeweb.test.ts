import { afterEach, describe, expect, it, vi } from 'vitest'
import { upsertTimewebARecord } from './timeweb'

const previous = process.env.TIMEWEB_API_TOKEN

afterEach(() => {
  vi.unstubAllGlobals()
  if (previous === undefined) delete process.env.TIMEWEB_API_TOKEN
  else process.env.TIMEWEB_API_TOKEN = previous
})

describe('Timeweb DNS', () => {
  it('keeps an existing matching A record', async () => {
    process.env.TIMEWEB_API_TOKEN = 'token'
    const fetchMock = vi.fn().mockResolvedValue(response({ dns_records: [{ id: 7, type: 'A', value: '1.1.1.1' }] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(upsertTimewebARecord('nl7.example.com', '1.1.1.1')).resolves.toEqual({ id: '7', created: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('updates the only existing A record', async () => {
    process.env.TIMEWEB_API_TOKEN = 'token'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ dns_records: [{ id: 8, data: { type: 'A', value: '8.8.8.8' } }] }))
      .mockResolvedValueOnce(response({ dns_record: { id: 8 } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(upsertTimewebARecord('nl7.example.com', '1.1.1.1')).resolves.toEqual({ id: '8', created: false })
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.timeweb.cloud/api/v2/domains/nl7.example.com/dns-records/8')
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ type: 'A', value: '1.1.1.1', ttl: 600 }),
    })
  })

  it('creates an A record when missing', async () => {
    process.env.TIMEWEB_API_TOKEN = 'token'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ dns_records: [] }))
      .mockResolvedValueOnce(response({ dns_record: { id: 9 } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(upsertTimewebARecord('nl7.example.com', '1.1.1.1')).resolves.toEqual({ id: '9', created: true })
  })

  it('creates a missing Timeweb subdomain before its A record', async () => {
    process.env.TIMEWEB_API_TOKEN = 'token'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ message: 'not found' }, 404))
      .mockResolvedValueOnce(response({ domains: [{ fqdn: 'stealthnet.site' }], meta: { total: 1 } }))
      .mockResolvedValueOnce(response({ subdomain: { fqdn: 'us01.stealthnet.site' } }, 201))
      .mockResolvedValueOnce(response({ dns_records: [] }))
      .mockResolvedValueOnce(response({ dns_record: { id: 11 } }, 201))
    vi.stubGlobal('fetch', fetchMock)

    await expect(upsertTimewebARecord('us01.stealthnet.site', '1.1.1.1')).resolves.toEqual({ id: '11', created: true })
    expect(fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
      ['https://api.timeweb.cloud/api/v1/domains/us01.stealthnet.site/dns-records?limit=100&offset=0', 'GET'],
      ['https://api.timeweb.cloud/api/v1/domains?limit=100&offset=0', 'GET'],
      ['https://api.timeweb.cloud/api/v1/domains/stealthnet.site/subdomains/us01', 'POST'],
      ['https://api.timeweb.cloud/api/v1/domains/us01.stealthnet.site/dns-records?limit=100&offset=0', 'GET'],
      ['https://api.timeweb.cloud/api/v2/domains/us01.stealthnet.site/dns-records', 'POST'],
    ])
  })

  it('creates a nested subdomain under the managed Timeweb parent domain', async () => {
    process.env.TIMEWEB_API_TOKEN = 'token'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ message: 'not found' }, 404))
      .mockResolvedValueOnce(response({ domains: [{ fqdn: 'example.com' }], meta: { total: 1 } }))
      .mockResolvedValueOnce(response({}, 201))
      .mockResolvedValueOnce(response({ dns_records: [] }))
      .mockResolvedValueOnce(response({ dns_record: { id: 12 } }, 201))
    vi.stubGlobal('fetch', fetchMock)

    await expect(upsertTimewebARecord('us01.nodes.example.com', '1.1.1.1')).resolves.toEqual({ id: '12', created: true })
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'https://api.timeweb.cloud/api/v1/domains/example.com/subdomains/us01.nodes'
    )
  })

  it('includes the Timeweb error code and response id in a failed request', async () => {
    process.env.TIMEWEB_API_TOKEN = 'token'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ dns_records: [] }))
      .mockResolvedValueOnce(response({
        status_code: 400,
        error_code: 'VALIDATION_ERROR',
        message: ['Invalid DNS value'],
        response_id: 'response-123',
      }, 400))
    vi.stubGlobal('fetch', fetchMock)

    await expect(upsertTimewebARecord('nl7.example.com', '1.1.1.1')).rejects.toThrow(
      'VALIDATION_ERROR · ["Invalid DNS value"] · response_id=response-123'
    )
  })

  it('refuses a stale IPv6 or CNAME route for the same hostname', async () => {
    process.env.TIMEWEB_API_TOKEN = 'token'
    const fetchMock = vi.fn().mockResolvedValue(response({
      dns_records: [{ id: 10, type: 'AAAA', value: '2001:db8::1' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(upsertTimewebARecord('nl7.example.com', '1.1.1.1')).rejects.toMatchObject({ status: 409 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
