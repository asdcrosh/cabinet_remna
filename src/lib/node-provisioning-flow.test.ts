import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolve4 } from 'node:dns/promises'
import { provisioningFixture } from '../../tests/fixtures/node-provisioning'
import { processNodeProvisioningJob } from './node-provisioning-worker'
import { buildNodeProvisioningProfile, prepareNodeProvisioningProfile, type PreparedProvisioningProfile } from './node-provisioning-profile'
import { verifyNodeProvisioningTraffic } from './node-provisioning-traffic'
import { verifyNodeSshAccess } from './node-provisioning-runner'
import { runNodeAnsible } from './node-provisioning-runner'
import { remnawave, type RemnawaveHost, type RemnawaveNode } from './remnawave'

const db = vi.hoisted(() => ({ jobFind: vi.fn(), jobUpdate: vi.fn(), event: vi.fn() }))
vi.mock('./prisma', () => ({ prisma: { nodeProvisioningJob: { findUnique: db.jobFind, update: db.jobUpdate }, nodeProvisioningEvent: { create: db.event } } }))
vi.mock('./node-provisioning-crypto', () => ({ decryptNodeProvisioningSecret: () => 'private-password' }))
vi.mock('./node-country', () => ({ resolveNodeCountryCode: () => 'RO', nodeHostRemark: (_country: string, kind: string) => 'Romania ' + kind }))
vi.mock('./timeweb', () => ({ upsertTimewebARecord: async () => ({ id: 'dns', created: true }) }))
vi.mock('node:dns/promises', () => ({ resolve4: vi.fn(async () => ['8.8.8.8']) }))
vi.mock('node:net', async importOriginal => ({
  ...await importOriginal<typeof import('node:net')>(),
  connect: () => {
    const socket = Object.assign(new EventEmitter(), { destroy: vi.fn() })
    queueMicrotask(() => socket.emit('connect'))
    return socket
  },
}))
vi.mock('./node-provisioning-runner', async importOriginal => ({
  ...await importOriginal<typeof import('./node-provisioning-runner')>(),
  verifyNodeSshAccess: vi.fn(), runNodeAnsible: vi.fn(async () => ({ hostKeyFingerprint: 'SHA256:test', output: 'failed=0' })),
}))
vi.mock('./node-provisioning-profile', async importOriginal => ({
  ...await importOriginal<typeof import('./node-provisioning-profile')>(), prepareNodeProvisioningProfile: vi.fn(),
}))
vi.mock('./node-provisioning-traffic', () => ({ verifyNodeProvisioningTraffic: vi.fn(), cleanupNodeProvisioningProbe: vi.fn(async () => undefined) }))
vi.mock('./remnawave', async importOriginal => ({
  ...await importOriginal<typeof import('./remnawave')>(),
  remnawave: Object.fromEntries(['getNodes', 'getHosts', 'getConfigProfile', 'getNodePlugins', 'getNodePlugin', 'updateNodePlugin', 'createNode', 'updateNode', 'getNodeSecret', 'createHost', 'updateHost'].map(name => [name, vi.fn()])),
}))

beforeEach(() => vi.clearAllMocks())
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

function setup() {
  vi.mocked(resolve4).mockResolvedValue(['8.8.8.8'])
  const fixture = provisioningFixture()
  const built = buildNodeProvisioningProfile(fixture.source, fixture.templates, fixture.job.fqdn)
  const templates = {
    tcp: { ...fixture.templates.tcp, sni: fixture.job.fqdn, inbound: { configProfileUuid: 'owned', configProfileInboundUuid: 'owned-tcp' } },
    xhttp: { ...fixture.templates.xhttp, sni: fixture.job.fqdn, inbound: { configProfileUuid: 'owned', configProfileInboundUuid: 'owned-xhttp' } },
  }
  const raw = built.config.inbounds as NonNullable<typeof fixture.source.inbounds[0]['rawInbound']>[]
  const profile: PreparedProvisioningProfile = {
    profileUuid: 'owned', inboundUuids: ['owned-tcp', 'owned-xhttp'], templates, probeSquadUuids: ['squad'],
    inbounds: { tcp: { ...fixture.source.inbounds[0]!, uuid: 'owned-tcp', rawInbound: raw[0] }, xhttp: { ...fixture.source.inbounds[1]!, uuid: 'owned-xhttp', rawInbound: raw[1] } },
  }
  const job = {
    ...fixture.job, status: 'RUNNING', step: 'QUEUED', sshPort: 22, sshUser: 'root', encryptedSshPassword: 'encrypted',
    credentialsExpireAt: new Date(Date.now() + 60000), sshHostKeyFingerprint: null,
    tcpTemplateHostUuid: fixture.templates.tcp.uuid, xhttpTemplateHostUuid: fixture.templates.xhttp.uuid,
    tcpHostUuid: null as string | null, xhttpHostUuid: null as string | null,
    lastError: null as string | null,
    remnawaveNodeUuid: null as string | null,
  }
  const hosts: RemnawaveHost[] = [...Object.values(fixture.templates)]
  const nodes: RemnawaveNode[] = [{ uuid: 'source-node', name: 'template', address: '1.1.1.1', isConnected: true, isDisabled: false, configProfile: { activeConfigProfileUuid: 'source', activeInbounds: fixture.source.inbounds } }]
  const order: string[] = []
  db.jobFind.mockImplementation(async () => job)
  db.jobUpdate.mockImplementation(async ({ data }) => Object.assign(job, data))
  db.event.mockResolvedValue({})
  vi.mocked(verifyNodeSshAccess).mockResolvedValue({ hostKeyFingerprint: 'SHA256:test', output: 'ok' })
  vi.mocked(prepareNodeProvisioningProfile).mockResolvedValue(profile)
  vi.mocked(remnawave.getHosts).mockImplementation(async () => ({ response: hosts }))
  vi.mocked(remnawave.getNodes).mockImplementation(async () => ({ response: nodes }))
  vi.mocked(remnawave.getConfigProfile).mockResolvedValue({ response: fixture.source })
  const plugin = { uuid: 'plugin', name: 'torrent_block', pluginConfig: { torrentBlocker: { enabled: true, blockDuration: 3600, ignoreLists: { ip: [], userId: [] } } } }
  vi.mocked(remnawave.getNodePlugins).mockResolvedValue({ response: { total: 1, nodePlugins: [plugin] } })
  vi.mocked(remnawave.getNodePlugin).mockResolvedValue({ response: plugin })
  vi.mocked(remnawave.getNodeSecret).mockResolvedValue({ response: { secretKey: 'private-node-secret' } })
  vi.mocked(remnawave.createNode).mockImplementation(async input => {
    const created = { ...input, uuid: 'new-node', isConnected: true, isDisabled: false, configProfile: { activeConfigProfileUuid: 'owned', activeInbounds: Object.values(profile.inbounds) } }
    nodes.push(created)
    return { response: created }
  })
  vi.mocked(remnawave.createHost).mockImplementation(async input => {
    const created = { ...input, uuid: 'new-host-' + hosts.length } as RemnawaveHost
    hosts.push(created)
    return { response: created }
  })
  vi.mocked(remnawave.updateHost).mockImplementation(async input => {
    const host = hosts.find(item => item.uuid === input.uuid)!
    Object.assign(host, input)
    if (input.isDisabled === false) order.push('publish-' + host.port)
    return { response: host }
  })
  vi.mocked(verifyNodeProvisioningTraffic).mockImplementation(async (_job, current, _profile, result) => {
    expect(current.tcp.isDisabled).toBe(true)
    expect(current.xhttp.isDisabled).toBe(true)
    order.push('TCP')
    await result('TCP: traffic verified')
    order.push('XHTTP')
    await result('XHTTP: traffic verified')
  })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ status: url.startsWith('https:') ? 200 : 301 })))
  return { job, hosts, order }
}

describe('provisioning acceptance gate', () => {
  it('publishes hosts only after both real traffic checks pass', async () => {
    const f = setup()
    await processNodeProvisioningJob(f.job.id)
    expect(f.job.status).toBe('SUCCEEDED')
    expect(f.job.encryptedSshPassword).toBe('')
    expect(f.order.slice(0, 2)).toEqual(['TCP', 'XHTTP'])
    expect(f.order.slice(2)).toHaveLength(2)
    expect(f.hosts.filter(host => host.address === f.job.fqdn).every(host => !host.isDisabled && !host.isHidden)).toBe(true)
  })

  it('quarantines both hosts and retains retry credentials if XHTTP traffic fails', async () => {
    const f = setup()
    vi.mocked(verifyNodeProvisioningTraffic).mockRejectedValueOnce(new Error('XHTTP: TLS rejected'))
    await processNodeProvisioningJob(f.job.id)
    expect(f.job.status).toBe('FAILED')
    expect(f.job.lastError).toContain('XHTTP')
    expect(f.job.encryptedSshPassword).toBe('encrypted')
    expect(f.order).toEqual([])
    expect(f.hosts.filter(host => host.address === f.job.fqdn).every(host => host.isDisabled && host.isHidden)).toBe(true)
  })

  it('does not disable another node host during failure cleanup', async () => {
    const f = setup()
    f.job.remnawaveNodeUuid = 'source-node'
    f.job.tcpHostUuid = f.hosts[0]!.uuid
    vi.mocked(verifyNodeSshAccess).mockRejectedValueOnce(new Error('SSH authentication failed'))
    await processNodeProvisioningJob(f.job.id)
    expect(f.job.status).toBe('FAILED')
    expect(f.hosts[0]!.isDisabled).toBe(false)
    expect(remnawave.updateHost).not.toHaveBeenCalled()
  })

  it('does not accept DNS that sends some clients to another node', async () => {
    const f = setup()
    vi.useFakeTimers()
    vi.stubEnv('NODE_PROVISIONING_DNS_TIMEOUT_SECONDS', '1')
    vi.mocked(resolve4).mockResolvedValue(['8.8.8.8', '1.1.1.1'])
    const running = processNodeProvisioningJob(f.job.id)
    await vi.runAllTimersAsync()
    await running
    expect(f.job.status).toBe('FAILED')
    expect(f.job.lastError).toContain('DNS')
    expect(runNodeAnsible).not.toHaveBeenCalled()
    expect(remnawave.createNode).not.toHaveBeenCalled()
  })
})
