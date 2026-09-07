import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireStaff: vi.fn(),
  findUnique: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mocks.requireAuth,
  requireStaff: mocks.requireStaff,
  withAuth: (handler: (...args: any[]) => Promise<Response>) => handler,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { supportAttachment: { findUnique: mocks.findUnique } },
}))

import { GET } from './route'

describe('GET /api/support/attachments/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1', role: 'USER' })
    mocks.findUnique.mockResolvedValue({
      fileName: 'чек.pdf',
      mimeType: 'application/pdf',
      data: Buffer.from('%PDF-test'),
      message: { ticket: { userId: 'user-1' } },
    })
  })

  it('returns an owned attachment with private security headers', async () => {
    const response = await GET(
      new Request('https://cabinet.example/api/support/attachments/file-1'),
      { params: Promise.resolve({ id: 'file-1' }) }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''")
    expect(mocks.requireStaff).not.toHaveBeenCalled()
  })

  it('requires a staff role when the attachment belongs to another user', async () => {
    mocks.findUnique.mockResolvedValue({
      fileName: 'screen.png',
      mimeType: 'image/png',
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      message: { ticket: { userId: 'user-2' } },
    })

    await GET(
      new Request('https://cabinet.example/api/support/attachments/file-2'),
      { params: Promise.resolve({ id: 'file-2' }) }
    )

    expect(mocks.requireStaff).toHaveBeenCalledOnce()
  })

  it('returns 404 for an unknown attachment', async () => {
    mocks.findUnique.mockResolvedValue(null)

    const response = await GET(
      new Request('https://cabinet.example/api/support/attachments/missing'),
      { params: Promise.resolve({ id: 'missing' }) }
    )

    expect(response.status).toBe(404)
  })
})
