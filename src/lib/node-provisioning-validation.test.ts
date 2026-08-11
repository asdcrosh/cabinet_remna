import { afterEach, describe, expect, it } from 'vitest'
import { buildProvisioningFqdn, createNodeProvisioningSchema, isPublicIpv4 } from './node-provisioning-validation'

const previous = process.env.NODE_PROVISIONING_BASE_DOMAIN

afterEach(() => {
  if (previous === undefined) delete process.env.NODE_PROVISIONING_BASE_DOMAIN
  else process.env.NODE_PROVISIONING_BASE_DOMAIN = previous
})

describe('node provisioning validation', () => {
  it.each(['1.1.1.1', '8.8.8.8', '185.10.20.30'])('accepts public IPv4 %s', (ip) => {
    expect(isPublicIpv4(ip)).toBe(true)
  })

  it.each(['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.2', '203.0.113.4', '01.2.3.4'])('rejects unsafe IPv4 %s', (ip) => {
    expect(isPublicIpv4(ip)).toBe(false)
  })

  it('normalizes a node slug and builds a server-owned fqdn', () => {
    process.env.NODE_PROVISIONING_BASE_DOMAIN = 'Example.COM.'
    const parsed = createNodeProvisioningSchema.parse({
      nodeName: 'Nl-07',
      serverIp: '1.1.1.1',
      sshPort: 22,
      sshUser: 'root',
      sshPassword: 'password-123',
      tcpTemplateHostUuid: '11111111-1111-4111-8111-111111111111',
      xhttpTemplateHostUuid: '22222222-2222-4222-8222-222222222222',
    })
    expect(parsed.nodeName).toBe('nl-07')
    expect(buildProvisioningFqdn(parsed.nodeName)).toBe('nl-07.example.com')
  })
})
