import { describe, expect, it } from 'vitest'
import { resolveNodeStatus } from './watch-probes'

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
