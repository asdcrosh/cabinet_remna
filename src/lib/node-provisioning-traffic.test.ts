import { beforeEach, describe, expect, it, vi } from 'vitest'
import { provisioningFixture } from '../../tests/fixtures/node-provisioning'
import { buildNodeProvisioningProfile, type PreparedProvisioningProfile } from './node-provisioning-profile'
import { buildNodeTrafficProbeConfig, runNodeTrafficProbe } from './node-provisioning-probe'
import { verifyNodeProvisioningTraffic } from './node-provisioning-traffic'
import { remnawave, RemnawaveError, type UserResponse } from './remnawave'

vi.mock('./remnawave', async importOriginal => {
  const actual = await importOriginal<typeof import('./remnawave')>()
  return { ...actual, remnawave: { getUser: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn() } }
})
vi.mock('./node-provisioning-probe', async importOriginal => ({
  ...await importOriginal<typeof import('./node-provisioning-probe')>(), runNodeTrafficProbe: vi.fn(),
}))

beforeEach(() => vi.resetAllMocks())

function setup() {
  const { source, templates, job } = provisioningFixture()
  const built = buildNodeProvisioningProfile(source, templates, job.fqdn)
  const raw = built.config.inbounds as NonNullable<typeof source.inbounds[0]['rawInbound']>[]
  const inbounds = { tcp: { ...source.inbounds[0]!, rawInbound: raw[0] }, xhttp: { ...source.inbounds[1]!, rawInbound: raw[1] } }
  const profile: PreparedProvisioningProfile = { profileUuid: 'owned', inboundUuids: ['tcp', 'xhttp'], inbounds, templates, probeSquadUuids: ['squad'] }
  const hosts = {
    tcp: { ...templates.tcp, address: job.fqdn, sni: job.fqdn },
    xhttp: { ...templates.xhttp, address: job.fqdn, sni: job.fqdn },
  }
  let stored: UserResponse | undefined
  const user: UserResponse = {
    id: 42, username: '', shortUuid: 'private-short-token', status: 'ACTIVE',
    usedTrafficBytes: '0', lifetimeUsedTrafficBytes: '0', trafficLimitBytes: '50000000', trafficLimitStrategy: 'NO_RESET',
    expireAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    vlessUuid: '00000000-0000-4000-8000-000000000001', trojanPassword: 'private-trojan', ssPassword: 'private-ss',
  }
  vi.mocked(remnawave.getUser).mockImplementation(async () => {
    if (!stored) throw new RemnawaveError(404, {}, 'not found')
    return { response: stored }
  })
  vi.mocked(remnawave.createUser).mockImplementation(async input => {
    stored = { ...user, username: input.username, description: input.description }
    return { response: stored }
  })
  vi.mocked(remnawave.deleteUser).mockImplementation(async () => { stored = undefined; return { response: { isDeleted: true } } })
  vi.mocked(runNodeTrafficProbe).mockResolvedValue({ status: 200 })
  const result = vi.fn<(message: string) => Promise<void>>().mockResolvedValue(undefined)
  return { job, hosts, profile, result, user, setStored: (value: UserResponse) => { stored = value }, getStored: () => stored }
}

describe('traffic verification lifecycle', () => {
  it('tests TCP and XHTTP with limited temporary credentials and confirms cleanup for numeric user IDs', async () => {
    const f = setup()
    await verifyNodeProvisioningTraffic(f.job, f.hosts, f.profile, f.result)
    expect(runNodeTrafficProbe).toHaveBeenCalledTimes(2)
    expect(f.result.mock.calls.map(call => call[0])).toEqual([
      'TCP: HTTPS 200, реальный трафик через VPN подтверждён',
      'XHTTP: HTTPS 200, реальный трафик через VPN подтверждён',
    ])
    expect(remnawave.createUser).toHaveBeenCalledWith(expect.objectContaining({ trafficLimitBytes: 50000000, activeInternalSquads: ['squad'] }))
    const input = vi.mocked(remnawave.createUser).mock.calls[0]![0]
    expect(new Date(input.expireAt).getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60000)
    expect(f.getStored()).toBeUndefined()
  })

  it.each([0, 1])('does not accept a node when transport %i fails, and still removes probe access', async failedIndex => {
    const f = setup()
    if (failedIndex === 1) vi.mocked(runNodeTrafficProbe).mockResolvedValueOnce({ status: 200 })
    vi.mocked(runNodeTrafficProbe).mockRejectedValueOnce(new Error('SOCKS connection rejected'))
    await expect(verifyNodeProvisioningTraffic(f.job, f.hosts, f.profile, f.result)).rejects.toThrow(failedIndex ? 'XHTTP' : 'TCP')
    expect(runNodeTrafficProbe).toHaveBeenCalledTimes(failedIndex + 1)
    expect(f.getStored()).toBeUndefined()
  })

  it('fails acceptance if the API leaves a temporary user behind', async () => {
    const f = setup()
    vi.mocked(remnawave.deleteUser).mockResolvedValue({ response: { isDeleted: false } })
    await expect(verifyNodeProvisioningTraffic(f.job, f.hosts, f.profile, f.result)).rejects.toThrow('Не удалось удалить')
    expect(f.getStored()).toBeDefined()
  })

  it('recovers a probe left by an interrupted previous attempt', async () => {
    const f = setup()
    f.setStored({ ...f.user, description: `Cabinet provisioning probe ${f.job.id}` })
    await verifyNodeProvisioningTraffic(f.job, f.hosts, f.profile, f.result)
    expect(remnawave.deleteUser).toHaveBeenCalledTimes(2)
    expect(vi.mocked(remnawave.deleteUser).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(remnawave.createUser).mock.invocationCallOrder[0]!)
  })

  it('does not delete an unrelated user whose name collides with the probe', async () => {
    const f = setup()
    f.setStored({ ...f.user, description: 'A real account' })
    await expect(verifyNodeProvisioningTraffic(f.job, f.hosts, f.profile, f.result)).rejects.toThrow('посторонним пользователем')
    expect(remnawave.deleteUser).not.toHaveBeenCalled()
    expect(remnawave.createUser).not.toHaveBeenCalled()
  })

  it('cleans up an ambiguous API create failure without exposing vendor response secrets', async () => {
    const f = setup()
    vi.mocked(remnawave.createUser).mockImplementationOnce(async () => {
      f.setStored({ ...f.user, description: `Cabinet provisioning probe ${f.job.id}` })
      throw new RemnawaveError(502, {}, 'secret response body')
    })
    await expect(verifyNodeProvisioningTraffic(f.job, f.hosts, f.profile, f.result)).rejects.toThrow('HTTP 502')
    expect(f.getStored()).toBeUndefined()
  })
})

describe('Reality traffic client construction', () => {
  it('uses the bound host SNI, selected node IP and a single VLESS outbound', () => {
    const f = setup()
    const config = buildNodeTrafficProbeConfig(f.hosts.tcp, f.profile.inbounds.tcp, f.user.vlessUuid, f.job.serverIp)
    expect(config.outbounds).toHaveLength(1)
    expect(config.outbounds[0]).toMatchObject({ protocol: 'vless', settings: { vnext: [{ address: f.job.serverIp, port: 10443 }] }, streamSettings: { realitySettings: { serverName: f.job.fqdn } } })
    expect(JSON.stringify(config)).not.toContain('freedom')
    expect(JSON.stringify(config)).not.toContain('privateKey')
    expect(config.inbounds[0]!.listen).toBe('127.0.0.1')
  })

  it('rejects the exact SNI mismatch that broke ro01 even when a TCP port is open', () => {
    const f = setup()
    f.profile.inbounds.tcp.rawInbound!.streamSettings!.realitySettings!.serverNames = ['www.cloudflare.com']
    expect(() => buildNodeTrafficProbeConfig(f.hosts.tcp, f.profile.inbounds.tcp, f.user.vlessUuid, f.job.serverIp)).toThrow('SNI')
    f.hosts.tcp.sni = 'www.cloudflare.com'
    expect(() => buildNodeTrafficProbeConfig(f.hosts.tcp, f.profile.inbounds.tcp, f.user.vlessUuid, f.job.serverIp)).not.toThrow()
    f.hosts.tcp.overrideSniFromAddress = true
    expect(() => buildNodeTrafficProbeConfig(f.hosts.tcp, f.profile.inbounds.tcp, f.user.vlessUuid, f.job.serverIp)).toThrow('SNI')
  })

  it('uses XHTTP path and headers from the host and inbound', () => {
    const f = setup()
    f.hosts.xhttp.host = f.job.fqdn
    f.hosts.xhttp.path = '/custom-path'
    const config = buildNodeTrafficProbeConfig(f.hosts.xhttp, f.profile.inbounds.xhttp, f.user.vlessUuid, f.job.serverIp)
    expect(config.outbounds[0]).toMatchObject({ streamSettings: { network: 'xhttp', xhttpSettings: { mode: 'stream-one', host: f.job.fqdn, path: '/custom-path' } } })
  })
})
