import type { Prisma, ReferralRewardTrigger } from '@prisma/client'
import { prisma } from './prisma'

const SETTINGS_ID = 'default'
const DEFAULT_REFERRAL_BONUS_DAYS = 7

export type ReferralSettings = {
  trigger: ReferralRewardTrigger
  minimumPaymentKopecks: number
  maxRewardsPerReferrer: number
  referrerBonusDays: number
  referredBonusDays: number
  referrerAttempts: number
  referredAttempts: number
}

type ReferralSettingsClient = Pick<Prisma.TransactionClient, 'referralSetting'>

export async function getReferralSettings(
  tx: ReferralSettingsClient = prisma
): Promise<ReferralSettings> {
  const setting = await tx.referralSetting.findUnique({ where: { id: SETTINGS_ID } })
  if (setting) return normalizeReferralSettings(setting)

  return {
    trigger: 'FIRST_PAYMENT',
    minimumPaymentKopecks: 0,
    maxRewardsPerReferrer: 0,
    referrerBonusDays: referralDaysFromEnv(),
    referredBonusDays: 0,
    referrerAttempts: envInt('BONUS_BOX_REFERRER_ATTEMPTS', 2, 0, 100),
    referredAttempts: envInt('BONUS_BOX_REFERRED_ATTEMPTS', 1, 0, 100),
  }
}

export async function updateReferralSettings(input: ReferralSettings) {
  const data = normalizeReferralSettings(input)
  return prisma.referralSetting.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  })
}

function normalizeReferralSettings(input: ReferralSettings): ReferralSettings {
  return {
    trigger: input.trigger === 'REGISTRATION' ? 'REGISTRATION' : 'FIRST_PAYMENT',
    minimumPaymentKopecks: clamp(input.minimumPaymentKopecks, 0, 100_000_000),
    maxRewardsPerReferrer: clamp(input.maxRewardsPerReferrer, 0, 100_000),
    referrerBonusDays: clamp(input.referrerBonusDays, 0, 365),
    referredBonusDays: clamp(input.referredBonusDays, 0, 365),
    referrerAttempts: clamp(input.referrerAttempts, 0, 100),
    referredAttempts: clamp(input.referredAttempts, 0, 100),
  }
}

function referralDaysFromEnv() {
  return envInt('REFERRAL_BONUS_DAYS', DEFAULT_REFERRAL_BONUS_DAYS, 1, 365)
}

function envInt(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) ? clamp(value, min, max) : fallback
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.floor(value)))
}
