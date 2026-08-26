import { prisma } from './prisma'
import { remnawave, type RemnawaveUserReference } from './remnawave'

export async function syncLocalDevicesFromRemnawave(input: {
  localUserId: string
  reference: RemnawaveUserReference
}) {
  const localDevices = await prisma.device.findMany({
    where: { userId: input.localUserId },
    select: {
      hwid: true,
      displayName: true,
      blockedAt: true,
      platform: true,
      userAgent: true,
      lastSeenAt: true,
    },
  })
  const displayNames = new Map(localDevices.map((device) => [device.hwid, device.displayName]))
  const blockedHwids = new Set(localDevices.filter((device) => device.blockedAt).map((device) => device.hwid))
  const remoteUser = (await remnawave.getUser(input.reference)).response
  const data = await remnawave.getUserDevices(remoteUser)
  const blockedRemoteDevices = data.response.devices.filter((device) => blockedHwids.has(device.hwid))
  await Promise.all(blockedRemoteDevices.map((device) => remnawave.deleteUserDevice(remoteUser, device.hwid)))
  const devices = data.response.devices.filter((device) => !blockedHwids.has(device.hwid)).map((device) => ({
    hwid: device.hwid,
    displayName: displayNames.get(device.hwid) ?? null,
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
      blockedAt: null,
      hwid: { notIn: devices.map((device) => device.hwid) },
    },
  })

  await prisma.user.update({
    where: { id: input.localUserId },
    data: {
      remnawaveId: remoteUser.id,
      remnawaveUuid: remoteUser.uuid ?? null,
      remnawaveShortUuid: remoteUser.shortUuid,
      remnawaveUsername: remoteUser.username,
    },
  })

  const blockedDevices = localDevices
    .filter((device) => device.blockedAt)
    .map((device) => ({
      hwid: device.hwid,
      displayName: device.displayName,
      platform: device.platform,
      userAgent: device.userAgent,
      updatedAt: device.lastSeenAt.toISOString(),
      blockedAt: device.blockedAt?.toISOString() ?? null,
    }))

  return { devices, blockedDevices, total: devices.length }
}
