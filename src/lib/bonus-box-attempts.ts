import { prisma } from './prisma'

/**
 * Сколько попыток рулетки пользователь может потратить прямо сейчас.
 * Лёгкий счётчик для шапки и главной: без начисления недельных попыток
 * и без загрузки призов (это делает getBonusBoxOverview на странице бонусов).
 */
export async function countAvailableBonusBoxAttempts(userId: string, now = new Date()) {
  return prisma.bonusBoxAttempt.count({
    where: {
      userId,
      usedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  })
}
