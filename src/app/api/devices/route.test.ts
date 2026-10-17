import { expect, it, vi } from 'vitest'

const requireAuth = vi.hoisted(() => vi.fn().mockResolvedValue({ uid: 'user-1' }))

vi.mock('@/lib/auth/guard', () => ({
  requireAuth,
  withAuth: (handler: () => unknown) => handler,
}))
// No database or Remnawave method is available: the retired endpoint must not use them.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/remnawave', () => ({}))
vi.mock('@/lib/remnawave-device-sync', () => ({}))

import { DELETE } from './route'

it('rejects the retired block-all command after authentication', async () => {
  const response = await DELETE()

  expect(response.status).toBe(410)
  expect(await response.json()).toEqual({ error: 'Блокировка устройств отключена' })
  expect(requireAuth).toHaveBeenCalledOnce()
})
