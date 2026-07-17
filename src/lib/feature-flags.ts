import { prisma } from './prisma'

export type FeatureFlags = {
  referrals: boolean
  bonusBox: boolean
  support: boolean
  broadcasts: boolean
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const setting = await prisma.featureSetting.findUnique({
    where: { id: 'default' },
    select: {
      referrals: true,
      bonusBox: true,
      support: true,
      broadcasts: true,
    },
  })

  return setting ?? getEnvironmentFeatureFlags()
}

export async function isFeatureEnabled(feature: keyof FeatureFlags) {
  return (await getFeatureFlags())[feature]
}

export async function updateFeatureFlags(flags: FeatureFlags) {
  return prisma.featureSetting.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...flags },
    update: flags,
    select: {
      referrals: true,
      bonusBox: true,
      support: true,
      broadcasts: true,
    },
  })
}

function getEnvironmentFeatureFlags(): FeatureFlags {
  return {
    referrals: envFlag('FEATURE_REFERRALS', true),
    bonusBox: envFlag('BONUS_BOX_ENABLED', true),
    support: envFlag('FEATURE_SUPPORT', true),
    broadcasts: envFlag('FEATURE_BROADCASTS', true),
  }
}

function envFlag(name: string, defaultValue: boolean) {
  const value = process.env[name]
  if (value == null || value === '') return defaultValue
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase())
}
