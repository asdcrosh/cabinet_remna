import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemnawaveHost } from './remnawave'

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

  it('creates a node with the Remnawave 2.8 config profile payload', async () => {
    const response = {
      uuid: '11111111-1111-4111-8111-111111111111',
      name: 'ams-01',
      address: 'ams-01.example.test',
      isConnected: false,
      isDisabled: false,
    }
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ response }))
    vi.stubGlobal('fetch', fetchMock)
    const { remnawave } = await import('./remnawave')
    const input = {
      name: 'ams-01',
      address: 'ams-01.example.test',
      port: 2222,
      countryCode: 'NL',
      configProfile: {
        activeConfigProfileUuid: '22222222-2222-4222-8222-222222222222',
        activeInbounds: [
          '33333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444',
        ],
      },
    }

    await expect(remnawave.createNode(input)).resolves.toEqual({ response })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://panel.example.test/api/nodes',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        body: JSON.stringify(input),
      })
    )
  })

  it('gets the node SECRET_KEY from the dedicated keygen endpoint', async () => {
    const response = { response: { pubKey: 'node-jwt-secret' } }
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(response))
    vi.stubGlobal('fetch', fetchMock)
    const { remnawave } = await import('./remnawave')

    await expect(remnawave.getNodeSecret()).resolves.toEqual(response)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://panel.example.test/api/keygen',
      expect.objectContaining({ method: 'GET', body: undefined })
    )
  })

  it('lists, reads, creates, configures and assigns a node plugin through the supported endpoints', async () => {
    const plugin = {
      uuid: '55555555-5555-4555-8555-555555555555',
      name: 'torrent_block',
      pluginConfig: null,
    }
    const node = {
      uuid: '11111111-1111-4111-8111-111111111111',
      name: 'ams-01',
      address: 'ams-01.example.test',
      isConnected: false,
      isDisabled: false,
      activePluginUuid: plugin.uuid,
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ response: { total: 0, nodePlugins: [] } }))
      .mockResolvedValueOnce(jsonResponse({ response: { ...plugin, pluginConfig: { ingressFilter: { enabled: true } } } }))
      .mockResolvedValueOnce(jsonResponse({ response: plugin }))
      .mockResolvedValueOnce(jsonResponse({ response: { ...plugin, pluginConfig: { torrentBlocker: { enabled: true } } } }))
      .mockResolvedValueOnce(jsonResponse({ response: node }))
    vi.stubGlobal('fetch', fetchMock)
    const { remnawave } = await import('./remnawave')

    await remnawave.getNodePlugins()
    await remnawave.getNodePlugin(plugin.uuid)
    await remnawave.createNodePlugin('torrent_block')
    await remnawave.updateNodePlugin(plugin.uuid, { torrentBlocker: { enabled: true } })
    await remnawave.updateNode({
      uuid: node.uuid,
      address: 'ams-01.example.test',
      activePluginUuid: plugin.uuid,
    })

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ['https://panel.example.test/api/node-plugins', 'GET'],
      [`https://panel.example.test/api/node-plugins/${plugin.uuid}`, 'GET'],
      ['https://panel.example.test/api/node-plugins', 'POST'],
      ['https://panel.example.test/api/node-plugins', 'PATCH'],
      ['https://panel.example.test/api/nodes', 'PATCH'],
    ])
    expect(JSON.parse(String(fetchMock.mock.calls[4]?.[1]?.body))).toEqual({
      uuid: node.uuid,
      address: 'ams-01.example.test',
      activePluginUuid: plugin.uuid,
    })
  })

  it('builds a lossless whitelisted host clone payload and creates it', async () => {
    const source: RemnawaveHost & { unexpectedResponseField: string } = {
      uuid: '55555555-5555-4555-8555-555555555555',
      viewPosition: 7,
      remark: 'TCP source',
      address: 'old.example.test',
      port: 443,
      path: '/tcp',
      sni: 'sni.example.test',
      host: 'host.example.test',
      alpn: 'h2,http/1.1',
      fingerprint: 'chrome',
      isDisabled: false,
      securityLayer: 'TLS',
      xhttpExtraParams: { mode: 'auto' },
      muxParams: { enabled: false },
      sockoptParams: { tcpFastOpen: true },
      finalMask: { type: 'none' },
      serverDescription: 'TCP edge',
      tags: ['EDGE:TCP'],
      isHidden: false,
      overrideSniFromAddress: true,
      keepSniBlank: false,
      pinnedPeerCertSha256: 'sha256',
      verifyPeerCertByName: 'peer.example.test',
      vlessRouteId: 12,
      shuffleHost: true,
      mihomoX25519: true,
      mihomoIpVersion: 'ipv4-prefer',
      inbound: {
        configProfileUuid: '66666666-6666-4666-8666-666666666666',
        configProfileInboundUuid: '77777777-7777-4777-8777-777777777777',
      },
      nodes: ['88888888-8888-4888-8888-888888888888'],
      xrayJsonTemplateUuid: '99999999-9999-4999-8999-999999999999',
      excludedInternalSquads: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      excludeFromSubscriptionTypes: ['XRAY_JSON', 'MIHOMO'],
      unexpectedResponseField: 'must-not-leak',
    }
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ response: source }))
    vi.stubGlobal('fetch', fetchMock)
    const { buildHostCloneRequest, remnawave } = await import('./remnawave')

    const input = buildHostCloneRequest(source, {
      remark: 'TCP ams-01',
      address: 'ams-01.example.test',
      nodes: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
    })
    await remnawave.createHost(input)

    expect(input).toMatchObject({
      inbound: source.inbound,
      remark: 'TCP ams-01',
      address: 'ams-01.example.test',
      port: 443,
      path: '/tcp',
      securityLayer: 'TLS',
      xhttpExtraParams: { mode: 'auto' },
      nodes: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
      excludeFromSubscriptionTypes: ['XRAY_JSON', 'MIHOMO'],
    })
    expect(input).not.toHaveProperty('uuid')
    expect(input).not.toHaveProperty('viewPosition')
    expect(input).not.toHaveProperty('unexpectedResponseField')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://panel.example.test/api/hosts')
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(input)
  })

  it('refuses to clone a host without concrete config profile and inbound UUIDs', async () => {
    const { buildHostCloneRequest, RemnawaveError } = await import('./remnawave')
    const source: RemnawaveHost = {
      uuid: '55555555-5555-4555-8555-555555555555',
      remark: 'Detached host',
      address: 'detached.example.test',
      port: 443,
      isDisabled: false,
      inbound: { configProfileUuid: null, configProfileInboundUuid: null },
      nodes: [],
    }

    expect(() => buildHostCloneRequest(source)).toThrow(RemnawaveError)
  })

  it('updates a host by UUID in the PATCH body', async () => {
    const response = { uuid: 'host-uuid', remark: 'updated' }
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ response }))
    vi.stubGlobal('fetch', fetchMock)
    const { remnawave } = await import('./remnawave')
    const input = {
      uuid: '55555555-5555-4555-8555-555555555555',
      remark: 'updated',
      address: 'ams-01.example.test',
      isDisabled: false,
      nodes: ['88888888-8888-4888-8888-888888888888'],
      tags: [],
    }

    await remnawave.updateHost(input)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://panel.example.test/api/hosts',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify(input) })
    )
  })

  it('deletes nodes and hosts through UUID path parameters', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ response: { isDeleted: true } }))
      .mockResolvedValueOnce(jsonResponse({ response: { isDeleted: true } }))
    vi.stubGlobal('fetch', fetchMock)
    const { remnawave } = await import('./remnawave')

    await remnawave.deleteNode('11111111-1111-4111-8111-111111111111')
    await remnawave.deleteHost('55555555-5555-4555-8555-555555555555')

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['https://panel.example.test/api/nodes/11111111-1111-4111-8111-111111111111', 'DELETE'],
      ['https://panel.example.test/api/hosts/55555555-5555-4555-8555-555555555555', 'DELETE'],
    ])
  })
})
