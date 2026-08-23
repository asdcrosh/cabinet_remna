import { readdir, rm } from 'fs/promises'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getPublicBrandSettings: vi.fn(),
  updateBrandSettings: vi.fn(),
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
}))
vi.mock('@/lib/branding', () => ({
  getPublicBrandSettings: mocks.getPublicBrandSettings,
  updateBrandSettings: mocks.updateBrandSettings,
}))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))

import { POST } from './route'

const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'branding')

function uploadRequest(file: Blob) {
  const form = new FormData()
  form.set('file', file, 'logo.png')
  return new Request('https://cabinet.example/api/admin/system/branding/upload', {
    method: 'POST',
    body: form,
  })
}

describe('branding logo upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin-1' })
    mocks.getPublicBrandSettings.mockResolvedValue({
      logoUrl: null,
      accentColor: '#d832d4',
      accentSecondaryColor: '#7133ff',
    })
    mocks.updateBrandSettings.mockImplementation(async (branding) => branding)
  })

  it('stores and immediately installs the uploaded logo', async () => {
    const file = new Blob(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      { type: 'image/png' }
    )

    const response = await POST(uploadRequest(file))
    const body = await response.json()
    const filename = body.logoUrl.split('/').pop()

    try {
      expect(response.status).toBe(200)
      expect(body.logoUrl).toMatch(/^\/uploads\/branding\/.+\.png$/)
      expect(mocks.updateBrandSettings).toHaveBeenCalledWith({
        logoUrl: body.logoUrl,
        accentColor: '#d832d4',
        accentSecondaryColor: '#7133ff',
      })
      expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        actorId: 'admin-1',
        message: 'Загружен и установлен логотип кабинета',
      }))
    } finally {
      if (filename) await rm(path.join(uploadsDir, filename), { force: true })
    }
  })

  it('rejects a file with spoofed image type', async () => {
    const file = new Blob([new Uint8Array([0x6e, 0x6f, 0x74, 0x2d, 0x70, 0x6e, 0x67])], {
      type: 'image/png',
    })

    const response = await POST(uploadRequest(file))
    const body = await response.json()

    expect(response.status).toBe(415)
    expect(body.error).toBe('Поддерживаются JPG, PNG и WEBP')
    expect(mocks.updateBrandSettings).not.toHaveBeenCalled()
  })

  it('removes the uploaded file when installing the logo fails', async () => {
    const before = await readdir(uploadsDir).catch(() => [])
    const file = new Blob(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      { type: 'image/png' }
    )
    mocks.updateBrandSettings.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(POST(uploadRequest(file))).rejects.toThrow('database unavailable')

    expect(await readdir(uploadsDir).catch(() => [])).toEqual(before)
  })
})
