import { prisma } from './prisma'
import { logWarn } from './logger'
import {
  hasRemnawaveUserReference,
  remnawave,
  RemnawaveError,
  remnawaveUserReference,
} from './remnawave'

export async function checkRemnawaveProfileOnLogin(user: {
  id: string
  remnawaveId: number | null
  remnawaveUuid: string | null
  remnawaveUsername: string | null
}) {
  if (!hasRemnawaveUserReference(user)) return

  try {
    const remoteUser = (await remnawave.getUser(remnawaveUserReference(user))).response

    await prisma.user.update({
      where: { id: user.id },
      data: {
        remnawaveId: remoteUser.id,
        remnawaveUuid: remoteUser.uuid ?? null,
        remnawaveShortUuid: remoteUser.shortUuid,
        remnawaveUsername: remoteUser.username,
      },
    })

    await prisma.subscription.updateMany({
      where: { userId: user.id, pendingSync: true },
      data: { pendingSync: false, lastSyncedAt: new Date() },
    })
  } catch (e) {
    if (isRemnawaveUserNotFound(e)) {
      await prisma.subscription.updateMany({
        where: { userId: user.id, status: { in: ['ACTIVE', 'LIMITED'] } },
        data: { pendingSync: true, lastSyncedAt: new Date() },
      })
      return
    }

    logWarn('remnawave_profile_check.skipped', {
      userId: user.id,
      message: e instanceof Error ? e.message : String(e),
    })
  }
}

export function isRemnawaveUserNotFound(error: unknown) {
  if (!(error instanceof RemnawaveError)) return false
  if (error.status === 404) return true
  const body = error.body
  return (
    typeof body === 'object' &&
    body !== null &&
    'errorCode' in body &&
    body.errorCode === 'A025'
  )
}
