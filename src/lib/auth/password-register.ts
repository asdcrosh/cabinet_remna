// Регистрация по email и паролю — общая для веб-кабинета и приложения StealthNet.
// Перенесено из /api/auth/register без изменения логики: письмо для подтверждения почты,
// реферальный код, связывание с Remnashop, уведомление администратору, реферальная награда.
import { Prisma } from '@prisma/client'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { createEmailVerificationToken, sendEmailVerificationLink } from '@/lib/email-verification'
import { generateUniqueReferralCode, normalizeReferralCode } from '@/lib/referrals'
import { registerRemnashopEmailUser } from '@/lib/remnashop-api'
import { findRemnashopUserByEmail } from '@/lib/remnashop-users'
import { createAdminNotification } from '@/lib/admin-notifications'
import { PERSONAL_DATA_CONSENT_VERSION, TERMS_VERSION } from '@/lib/legal'
import { logWarn } from '@/lib/logger'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { grantReferralRewardForRegistration } from '@/lib/referral-rewards'

export type PasswordRegisterInput = {
  email: string
  password: string
  name?: string
  referralCode?: string
  // Внутренний путь после подтверждения почты; без него — путь по умолчанию.
  next?: string
}

export type PasswordRegisterResult =
  // Аккаунт с такой почтой уже есть (письмо подтверждения отправлено повторно, если почта не подтверждена).
  | { kind: 'existing' }
  | { kind: 'referral_not_found' }
  | {
      kind: 'created'
      user: { id: string; email: string; role: string; name: string | null }
      emailDelivery: 'sent' | 'not_configured' | 'failed' | undefined
      remnashopSync: 'synced' | 'already_exists' | 'not_configured' | 'failed'
    }

async function linkRegisteredRemnashopUser(userId: string, email: string) {
  try {
    if (!process.env.REMNASHOP_DATABASE_URL) return
    const remnashopUser = await findRemnashopUserByEmail(email)
    if (!remnashopUser) return
    await prisma.user.update({
      where: { id: userId },
      data: {
        remnashopUserId: remnashopUser.id,
        remnashopSyncedAt: new Date(),
        emailVerifiedAt: remnashopUser.is_email_verified ? new Date() : undefined,
      },
    })
  } catch (error) {
    logWarn('auth.register.remnashop_identity_link_deferred', {
      userId,
      message: error instanceof Error ? error.message : 'unknown error',
    })
  }
}

export async function registerWithPassword(input: PasswordRegisterInput): Promise<PasswordRegisterResult> {
  const { email, password, name, next } = input
  const referralCode = await isFeatureEnabled('referrals')
    ? normalizeReferralCode(input.referralCode)
    : null

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    if (!existing.emailVerifiedAt) {
      try {
        const token = await createEmailVerificationToken(existing.id)
        await sendEmailVerificationLink({
          email: existing.email,
          name: existing.name,
          token,
          next,
        })
      } catch (error) {
        logWarn('auth.register.existing_verification_deferred', {
          userId: existing.id,
          message: error instanceof Error ? error.message : 'unknown error',
        })
      }
    }
    return { kind: 'existing' }
  }

  const passwordHash = await hash(password, 12) // 12 — баланс CPU/безопасности
  const referrer = referralCode
    ? await prisma.user.findUnique({
        where: { referralCode },
        select: { id: true },
      })
    : null

  if (referralCode && !referrer) {
    return { kind: 'referral_not_found' }
  }

  let user: { id: string; email: string; role: string; name: string | null }
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name || null,
        role: 'USER',
        referralCode: await generateUniqueReferralCode(),
        referredById: referrer?.id,
        agreedToTermsAt: new Date(),
        agreedToTermsVersion: TERMS_VERSION,
        personalDataConsentAt: new Date(),
        personalDataConsentVersion: PERSONAL_DATA_CONSENT_VERSION,
      },
      select: { id: true, email: true, role: true, name: true },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { kind: 'existing' }
    }
    throw error
  }

  const token = await createEmailVerificationToken(user.id)
  const delivery = await sendEmailVerificationLink({
    email: user.email,
    name: user.name,
    token,
    next,
  })

  let remnashopSync: 'synced' | 'already_exists' | 'not_configured' | 'failed' = 'not_configured'
  try {
    const result = await registerRemnashopEmailUser({
      email,
      password,
      name: name || null,
    })
    remnashopSync = !result.configured
      ? 'not_configured'
      : 'alreadyExists' in result
        ? 'already_exists'
        : 'synced'
    if (result.configured) {
      await linkRegisteredRemnashopUser(user.id, email)
    }
  } catch (error) {
    remnashopSync = 'failed'
    logWarn('auth.register.remnashop_deferred', {
      userId: user.id,
      message: error instanceof Error ? error.message : 'unknown error',
    })
  }

  await createAdminNotification({
    type: 'registration',
    severity: 'INFO',
    dedupeKey: `admin:registration:${user.id}`,
    title: 'Новая регистрация',
    body: `${user.email}${user.name ? `, ${user.name}` : ''}`,
    entityType: 'user',
    entityId: user.id,
    actionHref: '/dashboard/admin/users',
    actionLabel: 'Открыть пользователей',
  })

  if (referrer) {
    await grantReferralRewardForRegistration(user.id).catch((error) => {
      logWarn('auth.register.referral_reward_deferred', {
        userId: user.id,
        message: error instanceof Error ? error.message : 'unknown error',
      })
    })
  }

  return {
    kind: 'created',
    user,
    emailDelivery: delivery.sent ? 'sent' : delivery.reason,
    remnashopSync,
  }
}
