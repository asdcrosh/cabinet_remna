import { describe, expect, it } from 'vitest'
import { sanitizeProvisioningOutput } from './node-provisioning-runner'

describe('provisioning output sanitizer', () => {
  it('removes passwords, bearer tokens, JWT and terminal colors', () => {
    const output = '\u001b[31mfailed\u001b[0m password-123 Bearer token-value eyJabc.def.ghi node_secret_key=top-secret'
    const sanitized = sanitizeProvisioningOutput(output, ['password-123', 'top-secret'])

    expect(sanitized).toContain('failed')
    expect(sanitized).not.toContain('password-123')
    expect(sanitized).not.toContain('token-value')
    expect(sanitized).not.toContain('eyJabc')
    expect(sanitized).not.toContain('top-secret')
  })
})
