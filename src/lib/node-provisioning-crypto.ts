import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const VERSION = 'v1'

function keyMaterial() {
  const secret = process.env.NODE_PROVISIONING_ENCRYPTION_KEY?.trim()
  if (!secret || secret.length < 32) {
    throw new Error('NODE_PROVISIONING_ENCRYPTION_KEY must be at least 32 characters')
  }
  return createHash('sha256').update(`cabinet-remna:node-provisioning:${secret}`).digest()
}

export function encryptNodeProvisioningSecret(value: string) {
  if (!value) throw new Error('Secret is empty')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyMaterial(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptNodeProvisioningSecret(payload: string) {
  const [version, ivRaw, tagRaw, encryptedRaw, extra] = payload.split('.')
  if (version !== VERSION || !ivRaw || !tagRaw || !encryptedRaw || extra) {
    throw new Error('Encrypted provisioning secret has an invalid format')
  }
  const decipher = createDecipheriv('aes-256-gcm', keyMaterial(), Buffer.from(ivRaw, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
