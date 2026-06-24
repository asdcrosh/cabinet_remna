import { prisma } from './prisma'

const sessionUserSelect = {
  id: true,
  email: true,
  role: true,
  emailVerifiedAt: true,
  telegramId: true,
} as const

export async function findCanonicalTelegramSessionUser(input: {
  telegramId: bigint
  fallbackUserId?: string | null
}) {
  const telegramUser = await prisma.user.findUnique({
    where: { telegramId: input.telegramId },
    select: sessionUserSelect,
  })
  if (telegramUser) return telegramUser

  if (!input.fallbackUserId) return null
  return prisma.user.findUnique({
    where: { id: input.fallbackUserId },
    select: sessionUserSelect,
  })
}
