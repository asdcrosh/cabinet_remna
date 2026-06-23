import type { Plan } from '@prisma/client'
import { prisma } from './prisma'

type PlanAccessFields = Pick<
  Plan,
  'availability' | 'allowedEmails' | 'allowedTelegramIds'
>

export interface PlanAudienceContext {
  email: string
  telegramId: bigint | null
  isInvited: boolean
  hasPaidSubscription: boolean
}

export async function getPlanAudienceContext(userId: string): Promise<PlanAudienceContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      telegramId: true,
      referredById: true,
      remnashopUserId: true,
      remnawaveUuid: true,
      subscriptions: {
        where: { plan: { isPromo: false } },
        select: { id: true },
        take: 1,
      },
    },
  })

  if (!user) return null
  return {
    email: user.email,
    telegramId: user.telegramId,
    isInvited: Boolean(user.referredById),
    hasPaidSubscription:
      user.subscriptions.length > 0 ||
      Boolean(user.remnashopUserId) ||
      Boolean(user.remnawaveUuid),
  }
}

export function isPlanAvailableForUser(
  plan: PlanAccessFields,
  user: PlanAudienceContext,
  options: { allowLink?: boolean } = {}
) {
  switch (plan.availability) {
    case 'ALL':
      return true
    case 'NEW':
      return !user.hasPaidSubscription
    case 'EXISTING':
      return user.hasPaidSubscription
    case 'INVITED':
      return user.isInvited
    case 'ALLOWED': {
      const email = user.email.trim().toLowerCase()
      const telegramId = user.telegramId?.toString()
      return (
        plan.allowedEmails.some((item) => item.trim().toLowerCase() === email) ||
        Boolean(telegramId && plan.allowedTelegramIds.includes(telegramId))
      )
    }
    case 'LINK':
      return options.allowLink === true
    default:
      return false
  }
}
