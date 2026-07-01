import { prisma } from './prisma'
import { logWarn } from './logger'
import { remnawave, RemnawaveError } from './remnawave'

export async function checkRemnawaveProfileOnLogin(user: {
  id: string
  remnawaveUuid: string | null
  remnawaveUsername: string | null
}) {
  if (!user.remnawaveUuid && !user.remnawaveUsername) return

  try {
    if (user.remnawaveUuid) {
      await remnawave.getUserByUuid(user.remnawaveUuid)
    } else if (user.remnawaveUsername) {
      await remnawave.getUserByUsername(user.remnawaveUsername)
    }

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
