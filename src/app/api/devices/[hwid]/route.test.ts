import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  updateMany: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mocks.requireAuth,
  withAuth: (handler: (...args: never[]) => unknown) => handler,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    device: { updateMany: mocks.updateMany },
  },
}))
vi.mock('@/lib/remnawave', () => ({
  hasRemnawaveUserReference: vi.fn(),
  remnawave: {},
  RemnawaveError: class RemnawaveError extends Error {},
  remnawaveUserReference: vi.fn(),
}))

import { DELETE, PATCH } from './route'

describe('device rename route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1' })
    mocks.updateMany.mockResolvedValue({ count: 1 })
  })

  it('renames only the current user device', async () => {
    const response = await PATCH(
      new Request('https://cabinet.example/api/devices/device-1', {
        method: 'PATCH',
        body: JSON.stringify({ displayName: '  Рабочий ноутбук  ' }),
      }),
      { params: Promise.resolve({ hwid: 'device-1' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', hwid: 'device-1' },
      data: { displayName: 'Рабочий ноутбук' },
    })
  })

  it('rejects an empty name', async () => {
    const response = await PATCH(
      new Request('https://cabinet.example/api/devices/device-1', {
        method: 'PATCH',
        body: JSON.stringify({ displayName: '   ' }),
      }),
      { params: Promise.resolve({ hwid: 'device-1' }) }
    )

    expect(response.status).toBe(400)
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it('rejects the retired unblock command without changing the device', async () => {
    const response = await PATCH(
      new Request('https://cabinet.example/api/devices/device-1', {
        method: 'PATCH',
        body: JSON.stringify({ blocked: false }),
      }),
      { params: Promise.resolve({ hwid: 'device-1' }) }
    )

    expect(response.status).toBe(400)
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it('rejects block requests from an old client without remote or database mutations', async () => {
    const response = await DELETE()

    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ error: 'Блокировка устройств отключена' })
    expect(mocks.requireAuth).toHaveBeenCalledOnce()
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })
})
