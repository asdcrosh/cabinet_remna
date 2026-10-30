import type { RemnawaveConfigProfile, RemnawaveHost } from '../../src/lib/remnawave'

export function provisioningFixture() {
  const privateKey = Buffer.alloc(32, 7).toString('base64url')
  const raw = (tag: string, network: string, port: number) => ({
    tag, protocol: 'vless', port, settings: { clients: [], decryption: 'none' },
    sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] },
    streamSettings: {
      network, security: 'reality',
      realitySettings: { target: '/dev/shm/nginx.sock', serverNames: ['template.example.test'], privateKey, shortIds: ['0123456789abcdef'] },
      ...(network === 'xhttp' ? { xhttpSettings: { path: '/v1/health', mode: 'stream-one' } } : {}),
    },
  })
  const tcpRaw = raw('TCP', 'tcp', 10443)
  const xhttpRaw = raw('XHTTP', 'xhttp', 443)
  const source: RemnawaveConfigProfile = {
    uuid: 'source', name: 'Source profile', nodes: [],
    config: { inbounds: [tcpRaw, xhttpRaw], routing: { rules: [{ inboundTag: ['TCP'], outboundTag: 'DIRECT' }] }, outbounds: [{ protocol: 'freedom', tag: 'DIRECT' }] },
    inbounds: [
      { uuid: 'source-tcp', profileUuid: 'source', tag: 'TCP', network: 'tcp', port: 10443, rawInbound: tcpRaw },
      { uuid: 'source-xhttp', profileUuid: 'source', tag: 'XHTTP', network: 'xhttp', port: 443, rawInbound: xhttpRaw },
    ],
  }
  const host = (kind: string, port: number): RemnawaveHost => ({
    uuid: 'host-' + kind, remark: kind, address: 'template.example.test', sni: 'template.example.test',
    port, isDisabled: false, isHidden: false, nodes: ['source-node'], securityLayer: 'DEFAULT', fingerprint: 'firefox',
    inbound: { configProfileUuid: source.uuid, configProfileInboundUuid: 'source-' + kind },
  })
  return { source, templates: { tcp: host('tcp', 10443), xhttp: host('xhttp', 443) }, job: { id: 'test-job-12345678', fqdn: 'new.example.test', serverIp: '8.8.8.8', remnawaveNodeUuid: null } }
}
