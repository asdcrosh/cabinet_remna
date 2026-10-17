import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  update: vi.fn(),
  getUser: vi.fn(),
  getUserDevices: vi.fn(),
  deleteUserDevice: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    device: { findMany: mocks.findMany, upsert: mocks.upsert, deleteMany: mocks.deleteMany },
    user: { update: mocks.update },
  },
}))
vi.mock('./remnawave', () => ({ remnawave: {
  getUser: mocks.getUser,
  getUserDevices: mocks.getUserDevices,
  deleteUserDevice: mocks.deleteUserDevice,
} }))

import { syncLocalDevicesFromRemnawave } from './remnawave-device-sync'

describe('device sync after retiring manual blocks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findMany.mockResolvedValue([
      { hwid: 'android', displayName: 'Телефон', blockedAt: new Date() },
      { hwid: 'old-device', displayName: null, blockedAt: new Date() },
    ])
    mocks.getUser.mockResolvedValue({ response: { id: 16, username: 'user', shortUuid: 'short' } })
    mocks.getUserDevices.mockResolvedValue({ response: { devices: [
      { hwid: 'android', platform: 'Android' },
      { hwid: 'windows', platform: 'Windows' },
    ] } })
  })

  it('shows registered devices despite historical blocks and never deletes them remotely', async () => {
    const result = await syncLocalDevicesFromRemnawave({ localUserId: 'user-1', reference: { id: 16 } })

    expect(result.devices.map(({ hwid }) => hwid)).toEqual(['android', 'windows'])
    expect(result.devices[0]?.displayName).toBe('Телефон')
    expect(result.blockedDevices).toEqual([])
    expect(result.total).toBe(2)
    expect(mocks.deleteUserDevice).not.toHaveBeenCalled()
    expect(mocks.upsert).toHaveBeenCalledTimes(2)
  })
})
