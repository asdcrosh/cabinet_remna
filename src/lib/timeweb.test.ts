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
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ type: 'A', value: '1.1.1.1' }) })
  })

  it('creates an A record when missing', async () => {
    process.env.TIMEWEB_API_TOKEN = 'token'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ dns_records: [] }))
      .mockResolvedValueOnce(response({ dns_record: { id: 9 } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(upsertTimewebARecord('nl7.example.com', '1.1.1.1')).resolves.toEqual({ id: '9', created: true })
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

function response(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}
