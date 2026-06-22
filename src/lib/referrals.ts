import { randomBytes } from 'node:crypto'
import { prisma } from './prisma'

const REFERRAL_CODE_BYTES = 5

export function normalizeReferralCode(value: string | null | undefined) {
  const code = value?.trim()
  return code ? code.toUpperCase() : null
}

export async function generateUniqueReferralCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomBytes(REFERRAL_CODE_BYTES).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()
    if (code.length < 6) continue
    const existing = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } })
    if (!existing) return code
  }
  throw new Error('Failed to generate referral code')
}

export async function ensureUserReferralCode(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  })
  if (!user) throw new Error('User not found')
  if (user.referralCode) return user.referralCode

  for (let attempt = 0; attempt < 5; attempt++) {
    const referralCode = await generateUniqueReferralCode()
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode },
        select: { referralCode: true },
      })
      return updated.referralCode!
    } catch {
      // Unique race: retry with a new code.
    }
  }

  throw new Error('Failed to assign referral code')
}
