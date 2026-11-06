import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  updateMany: vi.fn(),
  findUser: vi.fn(),
  deleteDevices: vi.fn(),
  revokeSessions: vi.fn(),
  getUserDevices: vi.fn(),
  deleteUserDevice: vi.fn(),
  rateLimit: vi.fn(),
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mocks.requireAuth,
  withAuth: (handler: (...args: never[]) => unknown) => handler,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    device: { updateMany: mocks.updateMany, deleteMany: mocks.deleteDevices },
    user: { findUnique: mocks.findUser },
    mobileSession: { updateMany: mocks.revokeSessions },
  },
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/remnawave', () => {
  class RemnawaveError extends Error {}
  return {
    hasRemnawaveUserReference: (user: { remnawaveUsername?: string | null }) => Boolean(user.remnawaveUsername),
    remnawave: { getUserDevices: mocks.getUserDevices, deleteUserDevice: mocks.deleteUserDevice },
    RemnawaveError,
    remnawaveUserReference: (user: { remnawaveUsername: string }) => ({ username: user.remnawaveUsername }),
  }
})

import { RemnawaveError } from '@/lib/remnawave'
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

})

function unbind(hwid = 'device-1') {
  return DELETE(
    new Request(`https://cabinet.example/api/devices/${encodeURIComponent(hwid)}`, { method: 'DELETE' }),
    { params: Promise.resolve({ hwid: encodeURIComponent(hwid) }) }
  )
}

describe('device unbind route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1' })
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.findUser.mockResolvedValue({ id: 'user-1', remnawaveUsername: 'u1' })
    mocks.getUserDevices.mockResolvedValue({ response: { total: 2, devices: [{ hwid: 'device-1' }, { hwid: 'device-2' }] } })
    mocks.deleteUserDevice.mockResolvedValue({ response: [] })
    mocks.deleteDevices.mockResolvedValue({ count: 1 })
    mocks.revokeSessions.mockResolvedValue({ count: 1 })
  })

  it('removes the HWID from Remnawave and signs the app out on that device', async () => {
    const response = await unbind('device-1')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, revokedSessions: 1 })
    expect(mocks.deleteUserDevice).toHaveBeenCalledWith({ username: 'u1' }, 'device-1')
    expect(mocks.deleteDevices).toHaveBeenCalledWith({ where: { userId: 'user-1', hwid: 'device-1' } })
    expect(mocks.revokeSessions).toHaveBeenCalledWith({
      where: { userId: 'user-1', hwid: 'device-1', revokedAt: null },
      data: { revokedAt: expect.any(Date), revokeReason: 'device_unbound' },
    })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_DEVICE_UNBOUND' }))
  })

  it('does not block the device: no blockedAt is written', async () => {
    await unbind('device-1')
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it('returns 404 for a device the user does not have', async () => {
    const response = await unbind('someone-else')

    expect(response.status).toBe(404)
    expect(mocks.deleteUserDevice).not.toHaveBeenCalled()
    expect(mocks.revokeSessions).not.toHaveBeenCalled()
  })

  it('returns 404 without a Remnawave user', async () => {
    mocks.findUser.mockResolvedValue({ id: 'user-1', remnawaveUsername: null })
    const response = await unbind()

    expect(response.status).toBe(404)
    expect(mocks.getUserDevices).not.toHaveBeenCalled()
  })

  it('keeps sessions when Remnawave fails', async () => {
    mocks.deleteUserDevice.mockRejectedValue(new RemnawaveError(503, null, 'down'))
    const response = await unbind()

    expect(response.status).toBe(502)
    expect(mocks.deleteDevices).not.toHaveBeenCalled()
    expect(mocks.revokeSessions).not.toHaveBeenCalled()
  })

  it('is rate limited per user', async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
    const response = await unbind()

    expect(response.status).toBe(429)
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(Request), 'devices:unbind:user-1', 10, 60_000)
    expect(mocks.getUserDevices).not.toHaveBeenCalled()
  })

  it('decodes HWIDs with special characters', async () => {
    mocks.getUserDevices.mockResolvedValue({ response: { total: 1, devices: [{ hwid: 'a/b c' }] } })
    const response = await unbind('a/b c')

    expect(response.status).toBe(200)
    expect(mocks.deleteUserDevice).toHaveBeenCalledWith({ username: 'u1' }, 'a/b c')
  })
})
