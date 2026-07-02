import type { BonusBoxAttemptSource, Prisma } from '@prisma/client'
import { getBonusBoxConfig } from './bonus-box'
import { prisma } from './prisma'

type RewardTx = Pick<Prisma.TransactionClient, 'bonusBoxAttempt'>

export async function grantEngagementBonusBoxAttempts(input: {
  userId: string
  source: Extract<BonusBoxAttemptSource, 'BUNDLE' | 'SEASONAL_EVENT' | 'AUTOFUNNEL' | 'MISSION'>
  sourceKeyPrefix: string
  attemptsCount: number
  tx?: RewardTx
}) {
  const tx = input.tx ?? prisma
  const config = getBonusBoxConfig()
  if (!config.enabled) return { granted: 0 }

  const attemptsCount = Math.max(0, Math.min(100, Math.floor(input.attemptsCount)))
  if (attemptsCount <= 0) return { granted: 0 }

  const expiresAt = config.attemptTtlDays > 0
    ? new Date(Date.now() + config.attemptTtlDays * 24 * 60 * 60 * 1000)
    : null

  const result = await tx.bonusBoxAttempt.createMany({
    data: Array.from({ length: attemptsCount }, (_, index) => ({
      userId: input.userId,
      source: input.source,
      sourceKey: `${input.sourceKeyPrefix}:${index + 1}`,
      expiresAt,
    })),
    skipDuplicates: true,
  })

  return { granted: result.count }
}
