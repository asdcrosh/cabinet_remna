// Сид тарифов — выполняется один раз при деплое: `npm run seed`
// Создаёт базовую линейку тарифов, которые пользователь видит на /plans.

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
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { id: `plan-${plan.sortOrder}` }, // стабильные ID для дев-среды
      update: { ...plan, isActive: true },
      create: { id: `plan-${plan.sortOrder}`, ...plan, isActive: true },
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
