import { prisma } from './prisma'
import { hasRemnawaveUserReference, remnawave, remnawaveUserReference } from './remnawave'
import { logError } from './logger'

export async function reconcileBlockedDevices() {
  const blocked = await prisma.device.findMany({
    where: { blockedAt: { not: null } },
    orderBy: { blockedAt: 'asc' },
    select: {
      hwid: true,
      user: {
        select: {
          id: true,
          remnawaveId: true,
          remnawaveUuid: true,
          remnawaveUsername: true,
        },
      },
    },
  })
  const byUser = new Map<string, typeof blocked>()
  for (const device of blocked) {
    const devices = byUser.get(device.user.id) ?? []
    devices.push(device)
    byUser.set(device.user.id, devices)
  }

  let revoked = 0
  let failed = 0
  for (const devices of byUser.values()) {
    const user = devices[0]?.user
    if (!user || !hasRemnawaveUserReference(user)) continue
    try {
      const reference = remnawaveUserReference(user)
      const remote = await remnawave.getUserDevices(reference)
      const remoteHwids = new Set(remote.response.devices.map((device) => device.hwid))
      for (const device of devices) {
        if (!remoteHwids.has(device.hwid)) continue
        await remnawave.deleteUserDevice(reference, device.hwid)
        revoked += 1
      }
    } catch (error) {
      failed += devices.length
      logError('blocked_devices.reconcile_failed', error, { userId: user.id })
    }
  }

  return { checked: blocked.length, revoked, failed }
}
