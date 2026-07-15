import { PrismaClient } from '@prisma/client'
import { E2E_PLAN_ID, E2E_USERS } from './test-data'

const prisma = new PrismaClient()

export default async function globalTeardown() {
  if (process.env.E2E_TEST_DATABASE !== 'true') return

  try {
    await prisma.rateLimitBucket.deleteMany({
      where: {
        OR: [
          { key: { startsWith: 'auth-login:' } },
          { key: { startsWith: 'support:create:e2e-' } },
        ],
      },
    })
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(E2E_USERS).map((user) => user.email) } },
    })
    await prisma.plan.deleteMany({ where: { id: E2E_PLAN_ID } })
  } finally {
    await prisma.$disconnect()
  }
}
