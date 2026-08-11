import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const v3User = {
  id: 42,
  shortUuid: 'short-v3',
  username: 'alice',
  status: 'ACTIVE',
  usedTrafficBytes: '0',
  lifetimeUsedTrafficBytes: '0',
  trafficLimitBytes: '0',
  trafficLimitStrategy: 'MONTH',
  expireAt: '2026-09-01T00:00:00.000Z',
  createdAt: '2026-08-01T00:00:00.000Z',
  vlessUuid: 'vless',
  trojanPassword: 'trojan',
  ssPassword: 'ss',
}

const v2User = {
  ...v3User,
  uuid: '11111111-1111-4111-8111-111111111111',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Remnawave v2/v3 user identifiers', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.REMNAWAVE_BASE_URL = 'https://panel.example.test'
    process.env.REMNAWAVE_TOKEN = 'test-token'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.REMNAWAVE_BASE_URL
    delete process.env.REMNAWAVE_TOKEN
  })

  it('uses numeric id for a v3 update resolved by unchanged username lookup', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ response: v3User }))
      .mockResolvedValueOnce(jsonResponse({ response: { ...v3User, status: 'DISABLED' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { remnawave } = await import('./remnawave')

    await remnawave.updateUser(
      { uuid: v2User.uuid, username: v3User.username },
      { status: 'DISABLED' }
    )

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://panel.example.test/api/users/by-username/alice',
      expect.objectContaining({ method: 'GET' })
    )
    const updateCall = fetchMock.mock.calls[1]
    expect(updateCall?.[0]).toBe('https://panel.example.test/api/users')
    expect(JSON.parse(String(updateCall?.[1]?.body))).toEqual({ id: 42, status: 'DISABLED' })
  })

  it('keeps UUID request bodies for v2 responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ response: v2User }))
      .mockResolvedValueOnce(jsonResponse({ response: { ...v2User, status: 'DISABLED' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { remnawave } = await import('./remnawave')

    await remnawave.updateUser(
      { id: v2User.id, uuid: v2User.uuid, username: v2User.username },
      { status: 'DISABLED' }
    )

    const updateCall = fetchMock.mock.calls[1]
    expect(JSON.parse(String(updateCall?.[1]?.body))).toEqual({
      uuid: v2User.uuid,
      status: 'DISABLED',
    })
  })

  it('falls back from numeric id to UUID when a v2 route rejects the id', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'Validation failed' }, 400))
      .mockResolvedValueOnce(jsonResponse({ response: v2User }))
    vi.stubGlobal('fetch', fetchMock)
    const { remnawave } = await import('./remnawave')

    const result = await remnawave.getUser({ id: v2User.id, uuid: v2User.uuid })

    expect(result.response.uuid).toBe(v2User.uuid)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://panel.example.test/api/users/42',
      `https://panel.example.test/api/users/${v2User.uuid}`,
    ])
  })

  it('sends userId in v3 HWID request bodies', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ response: v3User }))
      .mockResolvedValueOnce(jsonResponse({ response: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { remnawave } = await import('./remnawave')

    await remnawave.deleteUserDevice({ username: v3User.username }, 'device-1')

    const deleteCall = fetchMock.mock.calls[1]
    expect(deleteCall?.[0]).toBe('https://panel.example.test/api/hwid/devices/delete')
    expect(JSON.parse(String(deleteCall?.[1]?.body))).toEqual({ userId: 42, hwid: 'device-1' })
  })

  it('uses numeric userId in the v3 HWID devices path', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ response: v3User }))
      .mockResolvedValueOnce(jsonResponse({ response: { total: 0, devices: [] } }))
    vi.stubGlobal('fetch', fetchMock)
    const { remnawave } = await import('./remnawave')

    await remnawave.getUserDevices({ id: v3User.id })

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://panel.example.test/api/users/42',
      'https://panel.example.test/api/hwid/devices/42',
    ])
  })
})
