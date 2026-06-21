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

import { AuthError, requireAdmin } from './guard'

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
})
