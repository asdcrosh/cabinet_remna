import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemnawaveHost, RemnawaveNode } from './remnawave'
import {
  assertTemplateTransport,
  buildProvisionedHostPayload,
  buildRemnawaveNodeAlignmentPatch,
  buildTorrentBlockPluginConfig,
  failInterruptedNodeProvisioningJobs,
} from './node-provisioning-worker'

const prismaMock = vi.hoisted(() => ({
  nodeProvisioningJob: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

beforeEach(() => {
  vi.clearAllMocks()
})

const host: RemnawaveHost = {
  uuid: '55555555-5555-4555-8555-555555555555',
  remark: 'TCP template',
  address: 'template.example.test',
  port: 10443,
  isDisabled: false,
  inbound: {
    configProfileUuid: '11111111-1111-4111-8111-111111111111',
    configProfileInboundUuid: '22222222-2222-4222-8222-222222222222',
  },
  nodes: [],
}

function node(sniffing?: { enabled?: boolean; destOverride?: string[] }): RemnawaveNode {
  return {
    uuid: '33333333-3333-4333-8333-333333333333',
    name: 'template-node',
    address: '1.1.1.1',
    isConnected: true,
    isDisabled: false,
    configProfile: {
      activeInbounds: [{
        uuid: host.inbound.configProfileInboundUuid!,
        network: 'tcp',
        sniffing,
      }],
    },
  }
}

describe('node provisioning template validation', () => {
  it('accepts a template inbound prepared for torrent_block', () => {
    expect(() => assertTemplateTransport(host, 'tcp', [node({
      enabled: true,
      destOverride: ['http', 'tls', 'quic'],
    })])).not.toThrow()
  })

  it('rejects a template inbound without complete sniffing', () => {
    expect(() => assertTemplateTransport(host, 'tcp', [node({
      enabled: true,
      destOverride: ['http', 'tls'],
    })])).toThrow('не готов к torrent_block')
  })
})

describe('torrent_block plugin configuration', () => {
  it('enables torrent blocking without replacing unrelated plugin settings', () => {
    expect(buildTorrentBlockPluginConfig({
      ingressFilter: { enabled: true, blockedIps: ['203.0.113.1'] },
      sharedLists: [{ name: 'ext:trusted', type: 'ipList', items: ['1.1.1.1'] }],
      torrentBlocker: { enabled: false, blockDuration: 600, ignoreLists: { ip: ['1.1.1.1'] } },
    })).toEqual({
      ingressFilter: { enabled: true, blockedIps: ['203.0.113.1'] },
      sharedLists: [{ name: 'ext:trusted', type: 'ipList', items: ['1.1.1.1'] }],
      torrentBlocker: {
        enabled: true,
        blockDuration: 600,
        ignoreLists: { ip: ['1.1.1.1'], userId: [] },
      },
    })
  })
})

describe('Remnawave node address alignment', () => {
  it('replaces a legacy IP address with the provisioned FQDN', () => {
    const current = node()
    current.address = '45.10.164.167'
    current.countryCode = 'US'
    current.activePluginUuid = '55555555-5555-4555-8555-555555555555'

    expect(buildRemnawaveNodeAlignmentPatch(current, {
      address: 'us01.stealthnet.site',
      countryCode: 'US',
      activePluginUuid: current.activePluginUuid,
    })).toEqual({
      uuid: current.uuid,
      address: 'us01.stealthnet.site',
    })
  })

  it('does not update a node that already uses the desired FQDN', () => {
    const current = node()
    current.address = 'us01.stealthnet.site'
    current.countryCode = 'US'
    current.activePluginUuid = '55555555-5555-4555-8555-555555555555'

    expect(buildRemnawaveNodeAlignmentPatch(current, {
      address: 'US01.STEALTHNET.SITE',
      countryCode: 'US',
      activePluginUuid: current.activePluginUuid,
    })).toBeNull()
  })
})

describe('provisioned host cloning', () => {
  it('copies tags only from the matching TCP template', () => {
    const payload = buildProvisionedHostPayload({
      ...host,
      tags: ['AUTO_MOBILE'],
    }, {
      fqdn: 'us01.stealthnet.site',
      nodeUuid: '33333333-3333-4333-8333-333333333333',
      countryCode: 'US',
      kind: 'TCP',
    })

    expect(payload.tags).toEqual(['AUTO_MOBILE'])
    expect(payload.tags?.some((tag) => tag.startsWith('CAB_'))).toBe(false)
  })

  it('keeps XHTTP tags empty when its own template has no tags', () => {
    const payload = buildProvisionedHostPayload({
      ...host,
      remark: 'XHTTP template',
      port: 443,
      tags: [],
    }, {
      fqdn: 'us01.stealthnet.site',
      nodeUuid: '33333333-3333-4333-8333-333333333333',
      countryCode: 'US',
      kind: 'XHTTP',
    })

    expect(payload.tags).toEqual([])
    expect(payload.tags).not.toContain('AUTO_MOBILE')
  })
})

describe('interrupted provisioning recovery', () => {
  it('makes jobs left RUNNING by a worker restart retryable', async () => {
    prismaMock.nodeProvisioningJob.findMany.mockResolvedValueOnce([
      { id: 'job-1', step: 'ANSIBLE' },
    ])
    prismaMock.nodeProvisioningJob.update.mockResolvedValueOnce({ id: 'job-1' })
    prismaMock.$transaction.mockResolvedValueOnce([])

    await expect(failInterruptedNodeProvisioningJobs()).resolves.toBe(1)
    expect(prismaMock.nodeProvisioningJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({
        status: 'FAILED',
        activeKey: null,
        lockedAt: null,
        completedAt: expect.any(Date),
        lastError: expect.stringContaining('Worker был перезапущен'),
        events: {
          create: expect.objectContaining({
            step: 'ANSIBLE',
            level: 'ERROR',
          }),
        },
      }),
    })
  })
})
