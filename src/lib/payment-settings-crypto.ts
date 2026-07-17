import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const VERSION = 'v1'

export function encryptPaymentSecret(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptPaymentSecret(value: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split('.')
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('Payment secret has an unsupported format')
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivValue, 'base64url')
  )
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

function encryptionKey() {
  const secret = process.env.PAYMENT_SETTINGS_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new Error('PAYMENT_SETTINGS_ENCRYPTION_KEY or JWT_SECRET must be at least 32 characters')
  }
  return createHash('sha256').update(`remnawave-cabinet:payment-settings:${secret}`, 'utf8').digest()
}
