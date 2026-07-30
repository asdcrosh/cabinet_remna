import { prisma } from './prisma'
import { findRemnashopUserByEmail } from './remnashop-users'
import { syncLinkedTelegramUser } from './telegram-link-sync'

export async function syncVerifiedIdentity(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      telegramId: true,
    },
  })
  if (!user) return { ok: false as const, reason: 'user_not_found' as const }
  if (!user.emailVerifiedAt || user.email.endsWith('@pending.invalid')) {
    return { ok: false as const, reason: 'email_not_verified' as const }
  }
  if (!process.env.REMNASHOP_DATABASE_URL) {
    return { ok: false as const, reason: 'remnashop_not_configured' as const }
  }

  if (user.telegramId) {
    const sync = await syncLinkedTelegramUser({
      localUserId: user.id,
      telegramId: user.telegramId,
    })
    if (sync.alreadyRunning) {
      return {
        ok: true as const,
        reason: 'sync_in_progress' as const,
        remnashopUserId: null,
      }
    }
    return {
      ok: sync.foundRemnashopUser,
      reason: sync.foundRemnashopUser ? null : 'remnashop_user_not_found',
      remnashopUserId: sync.remnashopUserId,
    }
  }

  const remnashopUser = await findRemnashopUserByEmail(user.email)
  if (!remnashopUser) {
    return { ok: false as const, reason: 'remnashop_user_not_found' as const }
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      remnashopUserId: remnashopUser.id,
      remnashopSyncedAt: new Date(),
    },
  })
  return {
    ok: true as const,
    reason: null,
    remnashopUserId: remnashopUser.id,
  }
}
