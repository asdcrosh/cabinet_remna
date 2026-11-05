import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimit: vi.fn(),
  revokeMobileSession: vi.fn(),
  writeAuditLog: vi.fn(),
}))
vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mocks.requireAuth,
  withAuth: (handler: unknown) => handler,
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/auth/mobile-session', () => ({ revokeMobileSession: mocks.revokeMobileSession }))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))

import { DELETE } from './route'

const call = (id: string) =>
  DELETE(new Request(`https://cabinet.example/api/mobile/auth/sessions/${id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  })

describe('DELETE /api/mobile/auth/sessions/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1' })
    mocks.rateLimit.mockResolvedValue({ ok: true })
  })

  it('отзывает только сессию текущего пользователя', async () => {
    mocks.revokeMobileSession.mockResolvedValue(true)
    const res = await call('ms-1')
    expect(res.status).toBe(200)
    expect(mocks.revokeMobileSession).toHaveBeenCalledWith({ sessionId: 'ms-1', userId: 'user-1' }, 'revoked_by_user')
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'MOBILE_SESSION_REVOKED' }))
  })

  it('чужая или несуществующая сессия — 404 без записи в журнал', async () => {
    mocks.revokeMobileSession.mockResolvedValue(false)
    const res = await call('ms-other')
    expect(res.status).toBe(404)
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })
})
