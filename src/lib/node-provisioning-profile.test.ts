import { beforeEach, describe, expect, it, vi } from 'vitest'
import { provisioningFixture } from '../../tests/fixtures/node-provisioning'
import { buildNodeProvisioningProfile, prepareNodeProvisioningProfile, provisioningResourceName } from './node-provisioning-profile'
import { remnawave, RemnawaveError, type RemnawaveConfigProfile, type RemnawaveInternalSquad } from './remnawave'

vi.mock('./remnawave', async importOriginal => {
  const actual = await importOriginal<typeof import('./remnawave')>()
  return { ...actual, remnawave: { getConfigProfile: vi.fn(), getConfigProfiles: vi.fn(), createConfigProfile: vi.fn(), getInternalSquads: vi.fn(), getInternalSquad: vi.fn(), updateInternalSquad: vi.fn() } }
})

beforeEach(() => vi.clearAllMocks())

describe('node-specific Reality profiles', () => {
  it('uses the new certificate name for local SelfSteal without mutating a shared profile', () => {
    const { source, templates, job } = provisioningFixture()
    const original = structuredClone(source)
    const result = buildNodeProvisioningProfile(source, templates, job.fqdn)
    expect(result.sni).toEqual({ tcp: job.fqdn, xhttp: job.fqdn })
    expect(result.config.routing).toEqual({ rules: [{ inboundTag: [result.tags.tcp], outboundTag: 'DIRECT' }] })
    expect(source).toEqual(original)
    const inbounds = result.config.inbounds as typeof source.inbounds[0]['rawInbound'][]
    expect(inbounds).toHaveLength(2)
    expect(inbounds[0]?.streamSettings?.realitySettings?.serverNames).toEqual([job.fqdn])
  })

  it('keeps an external camouflage domain instead of substituting the new FQDN', () => {
    const { source, templates, job } = provisioningFixture()
    const reality = source.inbounds[0]!.rawInbound!.streamSettings!.realitySettings!
    reality.target = 'www.cloudflare.com:443'
    reality.serverNames = ['www.cloudflare.com']
    const result = buildNodeProvisioningProfile(source, templates, job.fqdn)
    expect(result.sni.tcp).toBe('www.cloudflare.com')
    expect(result.sni.xhttp).toBe(job.fqdn)
  })

  it.each(['127.0.0.1:8443', '[::1]:8443', 'localhost:8443'])('updates local certificate SNI for a loopback target: %s', target => {
    const { source, templates, job } = provisioningFixture()
    source.inbounds[0]!.rawInbound!.streamSettings!.realitySettings!.target = target
    const result = buildNodeProvisioningProfile(source, templates, job.fqdn)
    expect(result.sni.tcp).toBe(job.fqdn)
  })

  it('allocates unique tags per job and rewrites routing references to those tags', () => {
    const { source, templates, job } = provisioningFixture()
    const first = buildNodeProvisioningProfile(source, templates, job.fqdn, 'job-first')
    const second = buildNodeProvisioningProfile(source, templates, job.fqdn, 'job-second')
    expect(first.tags.tcp).not.toBe(second.tags.tcp)
    expect(first.tags.xhttp.length).toBeLessThanOrEqual(30)
    expect(first.config.routing).toEqual({ rules: [{ inboundTag: [first.tags.tcp], outboundTag: 'DIRECT' }] })
  })

  it.each(['wrong-port', 'wrong-security', 'wrong-protocol', 'same-tag'])('rejects an unsafe template before creating remote resources: %s', problem => {
    const { source, templates, job } = provisioningFixture()
    if (problem === 'wrong-port') templates.tcp.port = 2222
    if (problem === 'wrong-security') templates.tcp.securityLayer = 'NONE'
    if (problem === 'wrong-protocol') source.inbounds[0]!.rawInbound!.protocol = 'trojan'
    if (problem === 'same-tag') source.inbounds[1]!.tag = 'TCP'
    expect(() => buildNodeProvisioningProfile(source, templates, job.fqdn)).toThrow()
    expect(remnawave.createConfigProfile).not.toHaveBeenCalled()
  })
})

describe('profile and internal squad recovery', () => {
  function setup() {
    const fixture = provisioningFixture()
    let owned: RemnawaveConfigProfile | undefined
    let squad: RemnawaveInternalSquad = { uuid: 'squad', name: 'Existing customers', inbounds: [...fixture.source.inbounds] }
    vi.mocked(remnawave.getConfigProfiles).mockImplementation(async () => ({ response: { configProfiles: owned ? [owned] : [] } }))
    vi.mocked(remnawave.getConfigProfile).mockImplementation(async uuid => ({ response: uuid === fixture.source.uuid ? fixture.source : owned! }))
    vi.mocked(remnawave.createConfigProfile).mockImplementation(async input => {
      const inbounds = input.config.inbounds as NonNullable<RemnawaveConfigProfile['inbounds'][0]['rawInbound']>[]
      owned = { uuid: 'owned', ...input, nodes: [], inbounds: inbounds.map((raw, i) => ({ ...fixture.source.inbounds[i]!, uuid: 'owned-' + i, tag: raw.tag!, profileUuid: 'owned', rawInbound: raw })) }
      return { response: owned }
    })
    vi.mocked(remnawave.getInternalSquads).mockImplementation(async () => ({ response: { internalSquads: [structuredClone(squad)] } }))
    vi.mocked(remnawave.getInternalSquad).mockImplementation(async () => ({ response: structuredClone(squad) }))
    vi.mocked(remnawave.updateInternalSquad).mockImplementation(async input => {
      const all = [...squad.inbounds, ...owned!.inbounds]
      squad = { ...squad, inbounds: input.inbounds.map(uuid => all.find(i => i.uuid === uuid)!) }
      return { response: squad }
    })
    return { ...fixture, getOwned: () => owned!, getSquad: () => squad }
  }

  it('recovers a profile after a retry and preserves existing squad access without duplicate entries', async () => {
    const fixture = setup()
    const first = await prepareNodeProvisioningProfile(fixture.job, fixture.templates)
    const retry = await prepareNodeProvisioningProfile(fixture.job, fixture.templates)
    expect(first.profileUuid).toBe(retry.profileUuid)
    expect(remnawave.createConfigProfile).toHaveBeenCalledTimes(1)
    expect(remnawave.updateInternalSquad).toHaveBeenCalledTimes(1)
    expect(fixture.getSquad().inbounds.map(i => i.uuid)).toEqual(['source-tcp', 'source-xhttp', 'owned-0', 'owned-1'])
    expect(first.templates.tcp.inbound.configProfileUuid).toBe('owned')
    expect(first.templates.tcp.overrideSniFromAddress).toBe(false)
    expect(first.probeSquadUuids).toEqual(['squad'])
  })

  it('does not adopt a job profile used by another node', async () => {
    const fixture = setup()
    await prepareNodeProvisioningProfile(fixture.job, fixture.templates)
    fixture.getOwned().nodes = [{ uuid: 'foreign-node' }]
    await expect(prepareNodeProvisioningProfile(fixture.job, fixture.templates)).rejects.toThrow('посторонней нодой')
  })

  it('requires access for both transports before creating a profile', async () => {
    const fixture = setup()
    fixture.getSquad().inbounds = [fixture.source.inbounds[0]!]
    await expect(prepareNodeProvisioningProfile(fixture.job, fixture.templates)).rejects.toThrow('XHTTP')
    expect(remnawave.createConfigProfile).not.toHaveBeenCalled()
  })

  it('does not leak private profile data from API errors', async () => {
    const fixture = setup()
    vi.mocked(remnawave.createConfigProfile).mockRejectedValue(new RemnawaveError(400, {}, 'privateKey=super-secret-key'))
    await expect(prepareNodeProvisioningProfile(fixture.job, fixture.templates)).rejects.toThrow('HTTP 400')
    await expect(prepareNodeProvisioningProfile(fixture.job, fixture.templates)).rejects.not.toThrow('super-secret-key')
  })

  it('keeps stable resource names within Remnawave limits for long job IDs', () => {
    const id = 'a'.repeat(64)
    expect(provisioningResourceName(id)).toHaveLength(28)
    expect(provisioningResourceName(id, 'cab_probe_').length).toBeLessThanOrEqual(36)
    expect(provisioningResourceName(id)).not.toBe(provisioningResourceName('b'.repeat(64)))
  })
})
