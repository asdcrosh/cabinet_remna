import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getUserDevices: vi.fn(),
  deleteUserDevice: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: { device: { findMany: mocks.findMany } },
}))
vi.mock('./remnawave', () => ({
  hasRemnawaveUserReference: () => true,
  remnawaveUserReference: (user: { remnawaveId: number }) => ({ id: user.remnawaveId }),
  remnawave: {
    getUserDevices: mocks.getUserDevices,
    deleteUserDevice: mocks.deleteUserDevice,
  },
}))
vi.mock('./logger', () => ({ logError: mocks.logError }))

import { reconcileBlockedDevices } from './blocked-devices'

describe('reconcileBlockedDevices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findMany.mockResolvedValue([
      {
        hwid: 'blocked-1',
        user: {
          id: 'user-1',
          remnawaveId: 42,
          remnawaveUuid: null,
          remnawaveUsername: null,
        },
      },
    ])
    mocks.deleteUserDevice.mockResolvedValue({ response: [] })
  })

  it('removes a blocked device when it registers again', async () => {
    mocks.getUserDevices.mockResolvedValue({
      response: { devices: [{ hwid: 'blocked-1' }, { hwid: 'allowed-1' }] },
    })

    await expect(reconcileBlockedDevices()).resolves.toEqual({ checked: 1, revoked: 1, failed: 0 })
    expect(mocks.deleteUserDevice).toHaveBeenCalledWith({ id: 42 }, 'blocked-1')
  })

  it('does nothing while the blocked device remains absent', async () => {
    mocks.getUserDevices.mockResolvedValue({ response: { devices: [{ hwid: 'allowed-1' }] } })

    await expect(reconcileBlockedDevices()).resolves.toEqual({ checked: 1, revoked: 0, failed: 0 })
    expect(mocks.deleteUserDevice).not.toHaveBeenCalled()
  })
})
