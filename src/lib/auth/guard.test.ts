import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('./cookies', () => ({ getSession: mocks.getSession }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))

import { AuthError, requireAdmin, requireAuth, requireStaff, requireSuperAdmin } from './guard'

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows admin when database role is ADMIN', async () => {
    const session = { uid: 'user-1', email: 'admin@example.com', role: 'ADMIN' as const }
    mocks.getSession.mockResolvedValue(session)
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' })

    await expect(requireAdmin()).resolves.toBe(session)
  })

  it('rejects stale admin session when database role is USER', async () => {
    mocks.getSession.mockResolvedValue({ uid: 'user-1', email: 'admin@example.com', role: 'ADMIN' })
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'USER' })

    await expect(requireAdmin()).rejects.toMatchObject(new AuthError(403, 'Forbidden'))
  })

  it('allows a Telegram-only Mini App session without email verification', async () => {
    const session = {
      uid: 'telegram-user',
      email: 'telegram-user@pending.invalid',
      role: 'USER',
      stage: 'EMAIL_PENDING',
    }
    mocks.getSession.mockResolvedValue(session)

    await expect(requireAuth()).resolves.toBe(session)
  })

  it('allows super admin in admin routes', async () => {
    const session = { uid: 'owner-1', email: 'owner@example.com', role: 'SUPER_ADMIN' as const }
    mocks.getSession.mockResolvedValue(session)
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'SUPER_ADMIN' })

    await expect(requireAdmin()).resolves.toBe(session)
    await expect(requireSuperAdmin()).resolves.toBe(session)
  })

  it('allows moderator only in staff routes', async () => {
    const session = { uid: 'moderator-1', email: 'mod@example.com', role: 'MODERATOR' as const }
    mocks.getSession.mockResolvedValue(session)
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'MODERATOR' })

    await expect(requireStaff()).resolves.toBe(session)
    await expect(requireAdmin()).rejects.toMatchObject(new AuthError(403, 'Forbidden'))
  })
})
