import { prisma } from './prisma'

export async function getProvisioningQueueHealth() {
  const now = new Date()
  const [pending, failed, staleRunning] = await Promise.all([
    prisma.provisioningJob.count({
      where: {
        status: 'PENDING',
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
    }),
    prisma.provisioningJob.count({ where: { status: 'FAILED' } }),
    prisma.provisioningJob.count({
      where: {
        status: 'RUNNING',
        lockedAt: { lt: new Date(now.getTime() - 15 * 60_000) },
      },
    }),
  ])

  return {
    ok: failed === 0 && staleRunning === 0,
    pending,
    failed,
    staleRunning,
  }
}
