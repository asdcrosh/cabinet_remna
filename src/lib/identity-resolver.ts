import type { User } from '@prisma/client'
import { prisma } from './prisma'

type IdentityUser = Pick<
  User,
  'id' | 'email' | 'emailVerifiedAt' | 'telegramId' | 'remnashopUserId'
>

export type IdentityResolution =
  | { action: 'use_existing'; user: IdentityUser }
  | { action: 'merge_technical_into_email'; source: IdentityUser; target: IdentityUser }
  | { action: 'merge_technical_into_remnashop_owner'; source: IdentityUser; target: IdentityUser }
  | { action: 'create_new' }

export async function resolveTelegramIdentity(input: {
  telegramId: bigint
  remnashopUserId?: number | null
  remnashopEmail?: string | null
}): Promise<IdentityResolution> {
  const telegramUser = await prisma.user.findUnique({
    where: { telegramId: input.telegramId },
    select: identitySelect,
  })
  const remnashopEmail = input.remnashopEmail?.trim().toLowerCase() || null

  if (
    telegramUser &&
    remnashopEmail &&
    input.remnashopUserId &&
    isTechnicalTelegramEmail(telegramUser.email)
  ) {
    const emailUser = await prisma.user.findUnique({
      where: { email: remnashopEmail },
      select: identitySelect,
    })
    if (
      emailUser &&
      emailUser.id !== telegramUser.id &&
      emailUser.remnashopUserId === input.remnashopUserId
    ) {
      return {
        action: 'merge_technical_into_email',
        source: telegramUser,
        target: emailUser,
      }
    }
  }

  if (telegramUser && input.remnashopUserId && telegramUser.remnashopUserId !== input.remnashopUserId) {
    const remnashopOwner = await prisma.user.findUnique({
      where: { remnashopUserId: input.remnashopUserId },
      select: identitySelect,
    })
    if (remnashopOwner && remnashopOwner.id !== telegramUser.id && isTechnicalTelegramEmail(telegramUser.email)) {
      return {
        action: 'merge_technical_into_remnashop_owner',
        source: telegramUser,
        target: remnashopOwner,
      }
    }
  }

  if (telegramUser) return { action: 'use_existing', user: telegramUser }

  if (input.remnashopUserId) {
    const remnashopLinkedUser = await prisma.user.findFirst({
      where: {
        remnashopUserId: input.remnashopUserId,
      },
      select: identitySelect,
    })
    if (remnashopLinkedUser) return { action: 'use_existing', user: remnashopLinkedUser }
  }

  return { action: 'create_new' }
}

export function isTechnicalTelegramEmail(email: string) {
  return email.startsWith('telegram-') && email.endsWith('@pending.invalid')
}

const identitySelect = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  telegramId: true,
  remnashopUserId: true,
} satisfies Record<keyof IdentityUser, true>
