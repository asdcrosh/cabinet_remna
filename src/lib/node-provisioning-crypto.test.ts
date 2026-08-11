import { afterEach, describe, expect, it } from 'vitest'
import { decryptNodeProvisioningSecret, encryptNodeProvisioningSecret } from './node-provisioning-crypto'

const previous = process.env.NODE_PROVISIONING_ENCRYPTION_KEY

afterEach(() => {
  if (previous === undefined) delete process.env.NODE_PROVISIONING_ENCRYPTION_KEY
  else process.env.NODE_PROVISIONING_ENCRYPTION_KEY = previous
})

describe('node provisioning secrets', () => {
  it('encrypts with authenticated random ciphertext', () => {
    process.env.NODE_PROVISIONING_ENCRYPTION_KEY = 'a'.repeat(32)
    const first = encryptNodeProvisioningSecret('ssh-password')
    const second = encryptNodeProvisioningSecret('ssh-password')

    expect(first).not.toBe(second)
    expect(first).not.toContain('ssh-password')
    expect(decryptNodeProvisioningSecret(first)).toBe('ssh-password')
  })

  it('does not fall back to another application secret', () => {
    delete process.env.NODE_PROVISIONING_ENCRYPTION_KEY
    expect(() => encryptNodeProvisioningSecret('secret')).toThrow(/NODE_PROVISIONING_ENCRYPTION_KEY/)
  })

  it('rejects modified ciphertext', () => {
    process.env.NODE_PROVISIONING_ENCRYPTION_KEY = 'b'.repeat(32)
    const payload = encryptNodeProvisioningSecret('secret')
    expect(() => decryptNodeProvisioningSecret(`${payload.slice(0, -1)}A`)).toThrow()
  })
})
