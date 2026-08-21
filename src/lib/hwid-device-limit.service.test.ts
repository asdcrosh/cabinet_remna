import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    device: { deleteMany: vi.fn() },
  },
  remnawave: {
    getUserDevices: vi.fn(),
    deleteUserDevice: vi.fn(),
  },
}))

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))
vi.mock('./remnawave', () => ({
  remnawave: mocks.remnawave,
  hasRemnawaveUserReference: () => true,
  remnawaveUserReference: () => ({ id: 42 }),
}))

import { trimUserDevicesToLimit } from './hwid-device-limit'

describe('trimUserDevicesToLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'user-1', remnawaveId: 42 })
    mocks.prisma.device.deleteMany.mockResolvedValue({ count: 2 })
    mocks.remnawave.deleteUserDevice.mockResolvedValue({ response: [] })
  })

  it('keeps the most active devices and removes the oldest first', async () => {
    mocks.remnawave.getUserDevices.mockResolvedValue({
      response: {
        total: 6,
        devices: [
          { hwid: 'device-3', updatedAt: '2026-03-01T00:00:00.000Z' },
          { hwid: 'device-1', updatedAt: '2026-01-01T00:00:00.000Z' },
          { hwid: 'device-6', updatedAt: '2026-06-01T00:00:00.000Z' },
          { hwid: 'device-2', updatedAt: '2026-02-01T00:00:00.000Z' },
          { hwid: 'device-5', updatedAt: '2026-05-01T00:00:00.000Z' },
          { hwid: 'device-4', updatedAt: '2026-04-01T00:00:00.000Z' },
        ],
      },
    })

    const result = await trimUserDevicesToLimit({ localUserId: 'user-1', deviceLimit: 4 })

    expect(result).toEqual({ total: 6, removed: 2 })
    expect(mocks.remnawave.deleteUserDevice).toHaveBeenNthCalledWith(1, { id: 42 }, 'device-1')
    expect(mocks.remnawave.deleteUserDevice).toHaveBeenNthCalledWith(2, { id: 42 }, 'device-2')
    expect(mocks.prisma.device.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', hwid: { in: ['device-1', 'device-2'] } },
    })
  })
})
