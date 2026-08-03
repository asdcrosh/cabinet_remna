import { describe, expect, it } from 'vitest'
import type { RemnawaveHost, RemnawaveNode, RemnawaveNodeInbound } from './remnawave'
import { resolveNodeStatus, resolveProbeTargets } from './watch-probes'

describe('resolveNodeStatus', () => {
  it('marks an explicitly disabled node as disabled', () => {
    expect(resolveNodeStatus({ connected: false, disabled: true, xhttp: 'FAIL', tcp: 'FAIL' })).toBe('DISABLED')
  })

  it('keeps a node degraded when the control plane is down but transport responds', () => {
    expect(resolveNodeStatus({ connected: false, disabled: false, xhttp: 'OK', tcp: 'FAIL' })).toBe('DEGRADED')
  })

  it('marks a node down only when control plane and transports are unavailable', () => {
    expect(resolveNodeStatus({ connected: false, disabled: false, xhttp: 'FAIL', tcp: 'SKIPPED' })).toBe('DOWN')
  })

  it('marks the data plane down when every configured transport fails', () => {
    expect(resolveNodeStatus({ connected: true, disabled: false, xhttp: 'FAIL', tcp: 'FAIL' })).toBe('DOWN')
  })

  it('marks a connected node healthy when every configured transport responds', () => {
    expect(resolveNodeStatus({ connected: true, disabled: false, xhttp: 'OK', tcp: 'OK' })).toBe('HEALTHY')
  })
})

describe('resolveProbeTargets', () => {
  const inbound: RemnawaveNodeInbound = {
    uuid: 'tcp-inbound',
    network: 'tcp',
    port: 10443,
    rawInbound: {
      streamSettings: {
        network: 'tcp',
        realitySettings: { serverNames: ['www.cloudflare.com'] },
      },
    },
  }
  const node: RemnawaveNode = {
    uuid: 'node-1',
    name: 'SELECTEL',
    address: 'selectel-node.example.com',
    isConnected: true,
    isDisabled: false,
    configProfile: {
      activeConfigProfileUuid: 'profile-1',
      activeInbounds: [inbound],
    },
  }

  it('uses the dedicated public subscription host instead of the internal inbound port', () => {
    const host: RemnawaveHost = {
      uuid: 'host-1',
      remark: 'SELECTEL',
      address: 'ru-bs-selectel.example.com',
      port: 443,
      path: null,
      sni: 'www.ya.ru',
      host: null,
      isDisabled: false,
      inbound: {
        configProfileUuid: 'profile-1',
        configProfileInboundUuid: 'tcp-inbound',
      },
      nodes: ['node-1'],
    }

    expect(resolveProbeTargets(node, inbound, 'tcp', [host])).toEqual([
      {
        host: 'ru-bs-selectel.example.com',
        port: 443,
        servername: 'www.ya.ru',
        path: undefined,
      },
    ])
  })

  it('does not attribute a shared load-balancer host to one physical node', () => {
    const sharedHost: RemnawaveHost = {
      uuid: 'host-shared',
      remark: 'AUTO',
      address: 'auto.example.com',
      port: 443,
      isDisabled: false,
      inbound: {
        configProfileUuid: 'profile-1',
        configProfileInboundUuid: 'tcp-inbound',
      },
      nodes: ['node-1', 'node-2'],
    }

    expect(resolveProbeTargets(node, inbound, 'tcp', [sharedHost])).toEqual([
      {
        host: 'selectel-node.example.com',
        port: 10443,
        servername: 'www.cloudflare.com',
        path: undefined,
      },
    ])
  })
})
