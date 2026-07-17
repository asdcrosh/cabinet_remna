import { rm } from 'fs/promises'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
}))
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://cabinet.example' }))
vi.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: vi.fn(async () => true) }))

import { POST } from './route'

const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'broadcasts')
const originalSigningSecret = process.env.BROADCAST_UPLOAD_SIGNING_SECRET

function uploadRequest(file: Blob) {
  const form = new FormData()
  form.set('file', file, 'banner.png')
  return new Request('https://cabinet.example/api/admin/broadcasts/upload', {
    method: 'POST',
    body: form,
  })
}

async function cleanupReturnedUpload(url: string) {
  const filename = new URL(url).pathname.split('/').pop()
  if (filename) await rm(path.join(uploadsDir, filename), { force: true })
}

describe('broadcast upload admin route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BROADCAST_UPLOAD_SIGNING_SECRET = 'test-broadcast-upload-secret-32-chars'
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin-1', email: 'admin@example.com', role: 'ADMIN' })
  })

  afterEach(() => {
    if (originalSigningSecret == null) delete process.env.BROADCAST_UPLOAD_SIGNING_SECRET
    else process.env.BROADCAST_UPLOAD_SIGNING_SECRET = originalSigningSecret
  })

  it('stores an image when content type matches magic bytes', async () => {
    const file = new Blob(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      { type: 'image/png' }
    )

    const response = await POST(uploadRequest(file))
    const body = await response.json()
    await cleanupReturnedUpload(body.url)

    expect(response.status).toBe(200)
    expect(body.url).toContain('/uploads/broadcasts/')
    expect(body.url).toContain('sig=')
  })

  it('rejects an image when content type is spoofed', async () => {
    const file = new Blob([new Uint8Array([0x6e, 0x6f, 0x74, 0x2d, 0x70, 0x6e, 0x67])], {
      type: 'image/png',
    })

    const response = await POST(uploadRequest(file))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Поддерживаются JPG, PNG, WEBP и GIF')
  })
})
