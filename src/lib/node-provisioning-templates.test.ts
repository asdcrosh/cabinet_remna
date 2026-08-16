import { describe, expect, it } from 'vitest'
import { inferHostKind } from './node-provisioning'

const host = {
  remark: 'Finland reserve',
  address: 'hidden.example.test',
  port: 443,
  path: '/',
  xhttpExtraParams: null,
}

describe('node provisioning template transport detection', () => {
  it('recognizes a hidden XHTTP host from its bound inbound instead of its name', () => {
    expect(inferHostKind(host, {
      network: 'xhttp',
      rawInbound: null,
    })).toBe('XHTTP')
  })

  it('recognizes splitHTTP as XHTTP and keeps TCP separate on the same port', () => {
    expect(inferHostKind(host, {
      network: null,
      rawInbound: { streamSettings: { network: 'splithttp' } },
    })).toBe('XHTTP')
    expect(inferHostKind(host, {
      network: 'tcp',
      rawInbound: null,
    })).toBe('TCP')
  })
})
