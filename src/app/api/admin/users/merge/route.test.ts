import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  mergeUsers: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireSuperAdmin: mocks.requireSuperAdmin,
  withAuth: (handler: (request: Request) => Promise<Response>) => handler,
}))

vi.mock('@/lib/admin-user-merge', () => ({
  AdminMergeUsersError: class AdminMergeUsersError extends Error {
    constructor(public status: number, message: string) {
      super(message)
    }
  },
  mergeTechnicalTelegramUserIntoEmailUser: mocks.mergeUsers,
}))

vi.mock('@/lib/logger', () => ({
  logError: mocks.logError,
}))

import { POST } from './route'

describe('admin user merge route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireSuperAdmin.mockResolvedValue({ uid: 'super-admin' })
    mocks.mergeUsers.mockResolvedValue({ targetEmail: 'user@example.com' })
  })

  it('requires super admin and passes the verified actor to the merge', async () => {
    const request = new Request('http://localhost/api/admin/users/merge', {
      method: 'POST',
      body: JSON.stringify({ sourceUserId: 'source-user', targetUserId: 'target-user' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mocks.requireSuperAdmin).toHaveBeenCalledOnce()
    expect(mocks.mergeUsers).toHaveBeenCalledWith(expect.objectContaining({
      sourceUserId: 'source-user',
      targetUserId: 'target-user',
      actorId: 'super-admin',
    }))
  })

  it('does not expose unexpected internal errors', async () => {
    mocks.mergeUsers.mockRejectedValueOnce(new Error('database host and query details'))
    const request = new Request('http://localhost/api/admin/users/merge', {
      method: 'POST',
      body: JSON.stringify({ sourceUserId: 'source-user', targetUserId: 'target-user' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Не удалось объединить аккаунты' })
    expect(mocks.logError).toHaveBeenCalledWith(
      'admin.users.merge_failed',
      expect.any(Error),
      { sourceUserId: 'source-user', targetUserId: 'target-user', actorId: 'super-admin' }
    )
  })
})
