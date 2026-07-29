import { randomBytes } from 'node:crypto'
import { hash } from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

if (process.env.OPS_STARTUP_CHECK === 'true') {
  console.log('bootstrap-superuser startup check passed')
  process.exit(0)
}

const prisma = new PrismaClient()

function referralCode() {
  return randomBytes(5)
    .toString('base64url')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 8)
    .toUpperCase()
}

async function uniqueReferralCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = referralCode()
    const existing = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    })
    if (!existing) return code
  }
  throw new Error('Failed to generate referral code')
}

async function main() {
  if (process.env.SUPERUSER_CHECK_ONLY === 'true') {
    const exists = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    })
    if (!exists) process.exitCode = 1
    return
  }

  const email = process.env.SUPERUSER_EMAIL?.trim().toLowerCase()
  const password = process.env.SUPERUSER_PASSWORD

  if (!email || !password) {
    throw new Error('SUPERUSER_EMAIL and SUPERUSER_PASSWORD are required')
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('Invalid admin email')
  }
  if (password.length < 8) {
    throw new Error('Admin password must be at least 8 characters')
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('Admin password must contain at least one latin letter and one digit')
  }

  const passwordHash = await hash(password, 12)
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, referralCode: true },
  })
  const now = new Date()

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role: 'SUPER_ADMIN',
        emailVerifiedAt: now,
        referralCode: existing.referralCode ?? await uniqueReferralCode(),
      },
    })
    console.log(`Admin user updated: ${email}`)
    return
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'SUPER_ADMIN',
      name: 'Administrator',
      emailVerifiedAt: now,
      agreedToTermsAt: now,
      referralCode: await uniqueReferralCode(),
    },
  })
  console.log(`Admin user created: ${email}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
