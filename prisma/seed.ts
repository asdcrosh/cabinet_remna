// Сид тарифов для пустой базы: создаёт стартовую линейку, но не трогает
// тарифы, которые администратор уже настроил в кабинете.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PLANS = [
  {
    name: 'Старт',
    description: 'Для знакомства с сервисом',
    priceKopecks: 0,
    durationDays: 3,
    trafficLimitGb: 50,
    deviceLimit: 2,
    sortOrder: 1,
  },
  {
    name: 'Базовый',
    description: 'Оптимально для повседневных задач',
    priceKopecks: 30000,
    durationDays: 30,
    trafficLimitGb: 200,
    deviceLimit: 5,
    sortOrder: 2,
  },
  {
    name: 'PRO',
    description: 'Максимум скорости и трафика',
    priceKopecks: 80000,
    durationDays: 30,
    trafficLimitGb: 500,
    deviceLimit: 10,
    sortOrder: 3,
  },
] as const

async function main() {
  const existingPlans = await prisma.plan.count()
  if (existingPlans > 0) {
    console.log(`Plans already exist (${existingPlans}), seed skipped`)
    return
  }

  for (const plan of PLANS) {
    await prisma.plan.create({
      data: { id: `plan-${plan.sortOrder}`, ...plan, isActive: true },
    })
  }
  console.log(`✅ Seeded ${PLANS.length} plans`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
