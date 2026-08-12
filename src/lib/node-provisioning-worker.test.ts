import { describe, expect, it } from 'vitest'
import type { RemnawaveHost, RemnawaveNode } from './remnawave'
import { assertTemplateTransport, buildTorrentBlockPluginConfig } from './node-provisioning-worker'

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
