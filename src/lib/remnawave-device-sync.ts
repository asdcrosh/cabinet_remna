import { prisma } from './prisma'
import { remnawave } from './remnawave'

export async function syncLocalDevicesFromRemnawave(input: {
  localUserId: string
  remnawaveUuid: string
}) {
  const data = await remnawave.getUserDevices(input.remnawaveUuid)
  const devices = data.response.devices.map((device) => ({
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
      hwid: { notIn: devices.map((device) => device.hwid) },
    },
  })

  return { devices, total: devices.length }
}
