import { prisma } from './prisma'
import { remnawave } from './remnawave'

export async function syncLocalDevicesFromRemnawave(input: {
  localUserId: string
  remnawaveUuid: string
}) {
  const data = await remnawave.getUserDevices(input.remnawaveUuid)
  const blockedDevices = await prisma.blockedDevice.findMany({
    where: {
      userId: input.localUserId,
      unblockedAt: null,
    },
    select: { hwid: true },
  })
  const blockedHwids = new Set(blockedDevices.map((device) => device.hwid))
  const remoteDevices = data.response.devices.filter((device) => !blockedHwids.has(device.hwid))
  const blockedRemoteDevices = data.response.devices.filter((device) => blockedHwids.has(device.hwid))

  await Promise.allSettled(
    blockedRemoteDevices.map((device) => remnawave.deleteUserDevice(input.remnawaveUuid, device.hwid))
  )

  const devices = remoteDevices.map((device) => ({
    hwid: device.hwid,
    platform: device.platform ?? device.deviceModel ?? null,
    osVersion: device.osVersion ?? null,
    deviceModel: device.deviceModel ?? null,
    userAgent: device.userAgent ?? null,
    ip: device.requestIp ?? null,
    createdAt: device.createdAt ?? null,
    updatedAt: device.updatedAt ?? null,
  }))

  await Promise.all(
    devices.map((device) =>
      prisma.device.upsert({
        where: { userId_hwid: { userId: input.localUserId, hwid: device.hwid } },
        create: {
          userId: input.localUserId,
          hwid: device.hwid,
          platform: device.platform,
          userAgent: device.userAgent,
          ip: device.ip,
          lastSeenAt: device.updatedAt ? new Date(device.updatedAt) : new Date(),
        },
        update: {
          platform: device.platform,
          userAgent: device.userAgent,
          ip: device.ip,
          lastSeenAt: device.updatedAt ? new Date(device.updatedAt) : new Date(),
        },
      })
    )
  )

  await prisma.device.deleteMany({
    where: {
      userId: input.localUserId,
      OR: [
        { hwid: { notIn: devices.map((device) => device.hwid) } },
        { hwid: { in: Array.from(blockedHwids) } },
      ],
    },
  })

  return { devices, total: devices.length }
}
