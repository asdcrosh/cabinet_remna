import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  updateMany: vi.fn(),
  rateLimit: vi.fn(),
  writeAuditLog: vi.fn(),
  clearSessionCookieOnResponse: vi.fn((response: Response) => response),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mocks.requireAuth,
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
}))
vi.mock('@/lib/auth/cookies', () => ({
  clearSessionCookieOnResponse: mocks.clearSessionCookieOnResponse,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { updateMany: mocks.updateMany } },
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))

import { DELETE } from './route'

describe('DELETE /api/me/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1', email: 'user@example.com', role: 'USER' })
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.updateMany.mockResolvedValue({ count: 1 })
  })

  it('increments the session version and clears the current cookie', async () => {
    const request = new Request('https://cabinet.example/api/me/sessions', { method: 'DELETE' })
    const response = await DELETE(request)

    expect(response.status).toBe(200)
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { sessionVersion: { increment: 1 } },
    })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'user-1',
      action: 'USER_SESSIONS_REVOKED',
    }))
    expect(mocks.clearSessionCookieOnResponse).toHaveBeenCalledOnce()
  })

  it('returns 404 when the account disappeared', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 })

    const response = await DELETE(new Request('https://cabinet.example/api/me/sessions', { method: 'DELETE' }))

    expect(response.status).toBe(404)
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })
})
