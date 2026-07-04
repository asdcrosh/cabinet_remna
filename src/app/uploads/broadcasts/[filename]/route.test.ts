import { mkdir, rm, writeFile } from 'fs/promises'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { signBroadcastUploadUrl } from '@/lib/broadcast-upload-url'
import { GET } from './route'

const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'broadcasts')
const filename = '2026-07-04-abc123.jpg'
const filePath = path.join(uploadsDir, filename)
const originalSecret = process.env.BROADCAST_UPLOAD_SIGNING_SECRET
const originalJwtSecret = process.env.JWT_SECRET
const originalLegacy = process.env.BROADCAST_UPLOAD_ALLOW_UNSIGNED_LEGACY

describe('broadcast upload route', () => {
  beforeEach(async () => {
    process.env.BROADCAST_UPLOAD_SIGNING_SECRET = 'test-broadcast-upload-secret-32-chars'
    delete process.env.BROADCAST_UPLOAD_ALLOW_UNSIGNED_LEGACY
    await mkdir(uploadsDir, { recursive: true })
    await writeFile(filePath, Buffer.from([0xff, 0xd8, 0xff]))
  })

  afterEach(async () => {
    if (originalSecret == null) delete process.env.BROADCAST_UPLOAD_SIGNING_SECRET
    else process.env.BROADCAST_UPLOAD_SIGNING_SECRET = originalSecret
    if (originalJwtSecret == null) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalJwtSecret
    if (originalLegacy == null) delete process.env.BROADCAST_UPLOAD_ALLOW_UNSIGNED_LEGACY
    else process.env.BROADCAST_UPLOAD_ALLOW_UNSIGNED_LEGACY = originalLegacy
    await rm(filePath, { force: true })
  })

  it('rejects broadcast uploads without a valid signature', async () => {
    const response = await GET(new Request(`https://cabinet.example/uploads/broadcasts/${filename}`), {
      params: { filename },
    })

    expect(response.status).toBe(404)
  })

  it('serves broadcast uploads with a valid signature', async () => {
    const signedUrl = signBroadcastUploadUrl(`https://cabinet.example/uploads/broadcasts/${filename}`)
    const response = await GET(new Request(signedUrl), { params: { filename } })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]))
  })
})
