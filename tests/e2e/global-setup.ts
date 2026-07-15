import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
import {
  E2E_PASSWORD,
  E2E_PLAN_ID,
  E2E_SUBSCRIPTION_ID,
  E2E_USERS,
} from './test-data'

const prisma = new PrismaClient()

export default async function globalSetup() {
  assertSafeTestDatabase()

  const passwordHash = await hash(E2E_PASSWORD, 4)
  const now = new Date()
  const startAt = new Date(now.getTime() - 32 * 24 * 60 * 60 * 1000)
  const expireAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

  try {
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(E2E_USERS).map((user) => user.email) } },
    })
    await prisma.plan.deleteMany({ where: { id: E2E_PLAN_ID } })

    await prisma.plan.create({
      data: {
        id: E2E_PLAN_ID,
        name: 'E2E Стандарт',
        description: 'Тестовый тариф браузерных сценариев',
        priceKopecks: 13000,
        durationDays: 7,
        trafficLimitGb: null,
        deviceLimit: 5,
        isActive: true,
        sortOrder: 10_000,
      },
    })

    await prisma.user.create({
      data: {
        ...E2E_USERS.basic,
        passwordHash,
        emailVerifiedAt: now,
        agreedToTermsAt: now,
        referralCode: 'E2EBASIC',
      },
    })

    await prisma.user.create({
      data: {
        ...E2E_USERS.expired,
        passwordHash,
        emailVerifiedAt: now,
        agreedToTermsAt: now,
        referralCode: 'E2EEXPIRED',
        subscriptions: {
          create: {
            id: E2E_SUBSCRIPTION_ID,
            planId: E2E_PLAN_ID,
            startAt,
            expireAt,
            status: 'EXPIRED',
            trafficLimitBytes: null,
          },
        },
      },
    })
  } finally {
    await prisma.$disconnect()
  }
}

function assertSafeTestDatabase() {
  if (process.env.E2E_TEST_DATABASE !== 'true') {
    throw new Error('E2E_TEST_DATABASE=true is required before preparing browser test data')
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required for E2E tests')

  const hostname = new URL(databaseUrl).hostname
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error(`E2E tests refuse to modify a non-local database host: ${hostname}`)
  }
}
