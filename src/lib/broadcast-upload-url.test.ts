import { describe, expect, it } from 'vitest'
import { isBroadcastUploadSignatureValid, signBroadcastUploadUrl } from './broadcast-upload-url'

process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-chars'

describe('broadcast upload urls', () => {
  it('signs uploaded broadcast image urls', () => {
    const signedUrl = signBroadcastUploadUrl('https://cabinet.example/uploads/broadcasts/2026-07-04-abc123.jpg')
    const parsed = new URL(signedUrl)

    expect(parsed.searchParams.get('sig')).toBeTruthy()
    expect(isBroadcastUploadSignatureValid('2026-07-04-abc123.jpg', parsed.searchParams.get('sig'))).toBe(true)
  })

  it('rejects signatures for another filename', () => {
    const signedUrl = signBroadcastUploadUrl('https://cabinet.example/uploads/broadcasts/2026-07-04-abc123.jpg')
    const signature = new URL(signedUrl).searchParams.get('sig')

    expect(isBroadcastUploadSignatureValid('2026-07-04-other.jpg', signature)).toBe(false)
  })
})
