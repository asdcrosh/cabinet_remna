import { describe, expect, it } from 'vitest'
import { AnsibleProvisioningError, sanitizeProvisioningOutput } from './node-provisioning-runner'

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

  it('keeps the useful tail of long Ansible failures', () => {
    const output = `${'old output\n'.repeat(1_000)}fatal: certificate issuance failed`
    const error = new AnsibleProvisioningError(2, output)

    expect(error.message).toContain('Ansible exited with code 2')
    expect(error.message).toContain('fatal: certificate issuance failed')
    expect(error.message.length).toBeGreaterThan(4_000)
  })

  it('labels Ansible timeouts explicitly', () => {
    const error = new AnsibleProvisioningError(124, 'ansible-playbook timed out')

    expect(error.message).toContain('Ansible timed out with code 124')
  })
})
