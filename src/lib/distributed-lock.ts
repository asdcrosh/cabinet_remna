import { createHash } from 'node:crypto'
import { prisma } from './prisma'

export type DistributedLockResult<T> =
  | { acquired: true; value: T }
  | { acquired: false }

export async function withDistributedLock<T>(
  key: string,
  task: () => Promise<T>
): Promise<DistributedLockResult<T>> {
  const lockKey = createHash('sha256').update(key).digest().readBigInt64BE(0)

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(${lockKey}) AS acquired
    `
    if (!rows[0]?.acquired) return { acquired: false as const }

    return {
      acquired: true as const,
      value: await task(),
    }
  }, {
    maxWait: 5_000,
    timeout: 45_000,
  })
}
