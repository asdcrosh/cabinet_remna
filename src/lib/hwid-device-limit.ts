import { prisma } from './prisma'
import {
  hasRemnawaveUserReference,
  remnawave,
  remnawaveUserReference,
  type HwidUserDevice,
} from './remnawave'

export async function trimUserDevicesToLimit(input: {
  localUserId: string
  deviceLimit: number
}) {
  const user = await prisma.user.findUnique({ where: { id: input.localUserId } })
  if (!user || !hasRemnawaveUserReference(user)) {
    return { total: 0, removed: 0 }
  }

  const reference = remnawaveUserReference(user)
  const response = await remnawave.getUserDevices(reference)
  const devices = [...response.response.devices].sort(compareRecentFirst)
  const excess = devices.slice(input.deviceLimit).reverse()

  for (const device of excess) {
    await remnawave.deleteUserDevice(reference, device.hwid)
  }

  if (excess.length > 0) {
    await prisma.device.deleteMany({
      where: {
        userId: input.localUserId,
        hwid: { in: excess.map((device) => device.hwid) },
      },
    })
  }

  return { total: devices.length, removed: excess.length }
}

export function compareRecentFirst(left: HwidUserDevice, right: HwidUserDevice) {
  const activityDifference = deviceActivityTime(right) - deviceActivityTime(left)
  if (activityDifference !== 0) return activityDifference
  return left.hwid.localeCompare(right.hwid)
}

function deviceActivityTime(device: HwidUserDevice) {
  const updatedAt = parseTime(device.updatedAt)
  if (updatedAt !== null) return updatedAt
  return parseTime(device.createdAt) ?? 0
}

function parseTime(value: string | undefined) {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}
