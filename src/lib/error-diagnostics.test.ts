import { describe, expect, it } from 'vitest'
import {
  buildServerErrorDiagnostics,
  sanitizeDiagnosticText,
  sanitizeDiagnosticValue,
} from './error-diagnostics'

describe('error diagnostics', () => {
  it('redacts credentials and secret fields', () => {
    expect(sanitizeDiagnosticText('postgresql://cabinet:topsecret@db/remnashop'))
      .toBe('postgresql://cabinet:[скрыто]@db/remnashop')
    expect(sanitizeDiagnosticValue({ token: '123:secret', table: 'users' })).toEqual({
      token: '[скрыто]',
      table: 'users',
    })
  })

  it('keeps a safe chain of server causes', () => {
    const cause = Object.assign(new Error('permission denied for table users'), { code: '42501' })
    const error = new Error('Remnashop sync failed', { cause })

    expect(buildServerErrorDiagnostics(error)).toEqual({
      reason: 'Remnashop sync failed',
      type: 'Error',
      causes: [{
        reason: 'permission denied for table users',
        type: 'Error',
        code: '42501',
      }],
    })
  })
})
