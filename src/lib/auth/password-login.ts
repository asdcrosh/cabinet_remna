// Проверка входа по email и паролю — общая для веб-кабинета и приложения StealthNet.
// Перенесено из /api/auth/login без изменения логики: bcrypt, запасной вход через Remnashop,
// связывание аккаунта Remnashop, проверка подтверждения почты и профиля Remnawave.
import { compare, hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { checkRemnawaveProfileOnLogin } from '@/lib/remnawave-profile-check'
import { logWarn } from '@/lib/logger'
import { authenticateRemnashopEmail, registerRemnashopEmailUser } from '@/lib/remnashop-api'
import { findRemnashopUserByEmail } from '@/lib/remnashop-users'
import { generateUniqueReferralCode } from '@/lib/referrals'
import { createAdminNotification } from '@/lib/admin-notifications'
import type { User } from '@prisma/client'

export type PasswordLoginResult =
  | { ok: true; user: User }
  | { ok: false; status: number; body: { error: string; code?: string } }

export async function authenticatePassword(email: string, password: string): Promise<PasswordLoginResult> {
  let user = await prisma.user.findUnique({ where: { email } })
  // Сравниваем даже при отсутствии пользователя — чтобы тайминг не указывал наличия
  const fakeHash = '$2a$12$0000000000000000000000.0000000000000000000000000000000000'
  let isValid = await compare(password, user?.passwordHash ?? fakeHash)

  const canUseRemnashopFallback =
    !user || (user.role === 'USER' && user.remnashopUserId !== null)
  if (
    !isValid &&
    canUseRemnashopFallback &&
    process.env.REMNASHOP_API_URL &&
    process.env.REMNASHOP_DATABASE_URL
  ) {
    try {
      const authenticated = await authenticateRemnashopEmail(email, password)
      if (authenticated) {
        const source = await findRemnashopUserByEmail(email)
        if (source) {
          const telegramId = source.telegram_id ? BigInt(source.telegram_id) : null
          const passwordHash = await hash(password, 12)
          const createdFromRemnashop = !user
          user = user
            ? await prisma.user.update({
                where: { id: user.id },
                data: {
                  passwordHash,
                  remnashopUserId: user.remnashopUserId ?? source.id,
                  remnashopSyncedAt: new Date(),
                  telegramId: user.telegramId ?? telegramId,
                  telegramUsername: user.telegramUsername ?? source.username,
                  telegramLinkedAt: user.telegramLinkedAt ?? (telegramId ? new Date() : null),
                  emailVerifiedAt: user.emailVerifiedAt ?? (source.is_email_verified ? new Date() : null),
                },
              })
            : await prisma.user.create({
                data: {
                  email,
                  passwordHash,
                  name: source.name,
                  role: 'USER',
                  referralCode: await generateUniqueReferralCode(),
                  telegramId,
                  telegramUsername: source.username,
                  telegramLinkedAt: telegramId ? new Date() : null,
                  emailVerifiedAt: source.is_email_verified ? new Date() : null,
                  remnashopUserId: source.id,
                  remnashopSyncedAt: new Date(),
                },
              })
          if (createdFromRemnashop) {
            await createAdminNotification({
              type: 'registration',
              severity: 'INFO',
              dedupeKey: `admin:registration:${user.id}`,
              title: 'Пользователь импортирован из Remnashop',
              body: `${user.email}${user.name ? `, ${user.name}` : ''}`,
              entityType: 'user',
              entityId: user.id,
              actionHref: '/dashboard/admin/users',
              actionLabel: 'Открыть пользователей',
            })
          }
          isValid = true
        }
      }
    } catch (error) {
      logWarn('auth.login.remnashop_fallback_unavailable', {
        email,
        message: error instanceof Error ? error.message : 'unknown error',
      })
    }
  }

  if (!user || !isValid) {
    return { ok: false, status: 401, body: { error: 'Неверный email или пароль' } }
  }

  if (process.env.REMNASHOP_API_URL && !user.remnashopUserId) {
    try {
      const authenticated = await authenticateRemnashopEmail(user.email, password)
      const registration = authenticated
        ? null
        : await registerRemnashopEmailUser({
            email: user.email,
            password,
            name: user.name,
          })
      const created =
        registration?.configured === true && !('alreadyExists' in registration)
      const canLink = authenticated || created
      const source =
        canLink && process.env.REMNASHOP_DATABASE_URL
          ? await findRemnashopUserByEmail(user.email)
          : null
      if (source) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            remnashopUserId: source.id,
            remnashopSyncedAt: new Date(),
          },
        })
      } else if (registration && 'alreadyExists' in registration) {
        logWarn('auth.login.remnashop_identity_conflict', {
          userId: user.id,
          message: 'Remnashop account with the same email rejected the Cabinet password',
        })
        await createAdminNotification({
          type: 'identity_conflict',
          severity: 'WARNING',
          dedupeKey: `admin:remnashop-password-conflict:${user.id}`,
          title: 'Не удалось связать аккаунт Remnashop',
          body: `${user.email}: в Remnashop уже есть аккаунт с другим паролем`,
          entityType: 'user',
          entityId: user.id,
          actionHref: '/dashboard/admin/duplicates',
          actionLabel: 'Проверить аккаунты',
        })
      }
    } catch (error) {
      logWarn('auth.login.remnashop_retry_deferred', {
        userId: user.id,
        message: error instanceof Error ? error.message : 'unknown error',
      })
    }
  }

  if (!user.emailVerifiedAt) {
    return { ok: false, status: 403, body: { error: 'Подтвердите email перед входом', code: 'EMAIL_NOT_VERIFIED' } }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  await checkRemnawaveProfileOnLogin({
    id: user.id,
    remnawaveId: user.remnawaveId,
    remnawaveUuid: user.remnawaveUuid,
    remnawaveUsername: user.remnawaveUsername,
  })

  return { ok: true, user }
}
