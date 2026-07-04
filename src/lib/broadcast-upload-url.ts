import { createHmac, timingSafeEqual } from 'node:crypto'

const SIGNATURE_PARAM = 'sig'

export function signBroadcastUploadUrl(url: string) {
  const parsed = new URL(url)
  const filename = parsed.pathname.split('/').pop() ?? ''
  parsed.searchParams.set(SIGNATURE_PARAM, signBroadcastFilename(filename))
  return parsed.toString()
}

export function isBroadcastUploadSignatureValid(filename: string, signature: string | null) {
  if (!signature) return false
  const expected = signBroadcastFilename(filename)
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== actualBuffer.length) return false
  return timingSafeEqual(expectedBuffer, actualBuffer)
}

function signBroadcastFilename(filename: string) {
  const secret = process.env.BROADCAST_UPLOAD_SIGNING_SECRET || process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('BROADCAST_UPLOAD_SIGNING_SECRET or JWT_SECRET must be at least 32 characters')
  }
  return createHmac('sha256', secret).update(filename).digest('base64url')
}
