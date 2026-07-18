import { randomBytes } from 'node:crypto'
import { hash } from 'bcryptjs'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { setSessionCookieOnResponse } from '@/lib/auth/cookies'
import { getAppUrlOrRequestOrigin } from '@/lib/app-url'
import { checkRemnawaveProfileOnLogin } from '@/lib/remnawave-profile-check'
import { logWarn } from '@/lib/logger'
import { generateUniqueReferralCode, normalizeReferralCode } from '@/lib/referrals'
import { isFeatureEnabled } from '@/lib/feature-flags'
import {
  exchangeYandexCode,
  fetchYandexProfile,
  sanitizeOAuthNext,
  YANDEX_OAUTH_LEGAL_COOKIE,
  YANDEX_OAUTH_NEXT_COOKIE,
  YANDEX_OAUTH_REF_COOKIE,
  YANDEX_OAUTH_STATE_COOKIE,
  type YandexProfile,
} from '@/lib/yandex-oauth'
import { createAdminNotification } from '@/lib/admin-notifications'
import { PERSONAL_DATA_CONSENT_VERSION, TERMS_VERSION } from '@/lib/legal'

export const runtime = 'nodejs'

const YANDEX_PROVIDER = 'yandex'

export async function GET(req: Request) {
  const requestUrl = new URL(req.url)
  const baseUrl = getAppUrlOrRequestOrigin(req)
  const cookieStore = await cookies()
  const next = sanitizeOAuthNext(cookieStore.get(YANDEX_OAUTH_NEXT_COOKIE)?.value)
  const successUrl = new URL(next, baseUrl)
  const errorUrl = new URL('/login', baseUrl)

  const providerError = requestUrl.searchParams.get('error')
  if (providerError) {
    errorUrl.searchParams.set('yandex_error', providerError)
    return clearYandexCookies(NextResponse.redirect(errorUrl))
  }

  const code = requestUrl.searchParams.get('code')
  const state = requestUrl.searchParams.get('state')
  const expectedState = cookieStore.get(YANDEX_OAUTH_STATE_COOKIE)?.value

  if (!code || !state || !expectedState || state !== expectedState) {
    errorUrl.searchParams.set('yandex_error', 'invalid_state')
    return clearYandexCookies(NextResponse.redirect(errorUrl))
  }

  try {
    const tokenResponse = await exchangeYandexCode(code)
    const profile = await fetchYandexProfile(tokenResponse.accessToken)
    const referralCode = await isFeatureEnabled('referrals')
      ? normalizeReferralCode(cookieStore.get(YANDEX_OAUTH_REF_COOKIE)?.value)
      : null
    const allowCreate = cookieStore.get(YANDEX_OAUTH_LEGAL_COOKIE)?.value === '1'
    const user = await findOrCreateYandexUser(profile, referralCode, allowCreate)

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    await checkRemnawaveProfileOnLogin({
      id: user.id,
      remnawaveUuid: user.remnawaveUuid,
      remnawaveUsername: user.remnawaveUsername,
    })

    const response = NextResponse.redirect(successUrl)
    await setSessionCookieOnResponse(response, {
      uid: user.id,
      email: user.email,
      role: user.role,
    })
    return clearYandexCookies(response)
  } catch (error) {
    logWarn('auth.yandex.callback_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    errorUrl.searchParams.set(
      'yandex_error',
      error instanceof Error && error.message === 'yandex_legal_consent_required'
        ? 'legal_required'
        : 'yandex_auth_failed'
    )
    return clearYandexCookies(NextResponse.redirect(errorUrl))
  }
}

async function findOrCreateYandexUser(
  profile: YandexProfile,
  referralCode: string | null,
  allowCreate: boolean
) {
  if (!profile.emailVerified) {
    throw new Error('yandex_email_not_verified')
  }

  const existingAccount = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider: YANDEX_PROVIDER,
        providerUserId: profile.providerUserId,
      },
    },
    include: { user: true },
  })

  if (existingAccount) {
    let emailOwner =
      existingAccount.user.email.toLowerCase() === profile.email.toLowerCase()
        ? existingAccount.user
        : await prisma.user.findUnique({ where: { email: profile.email } })
    if (!emailOwner && existingAccount.user.email.toLowerCase() !== profile.email.toLowerCase()) {
      assertCanCreateYandexUser(allowCreate)
      emailOwner = await createYandexUser(profile, { createOAuthAccount: false, referralCode })
    }
    if (
      emailOwner &&
      emailOwner.id !== existingAccount.user.id &&
      !canLinkYandexToExistingEmailUser(emailOwner, profile)
    ) {
      throw new Error('yandex_email_owner_requires_step_up')
    }
    const user = emailOwner ?? existingAccount.user

    await prisma.oAuthAccount.update({
      where: { id: existingAccount.id },
      data: {
        userId: user.id,
        email: profile.email,
        emailVerified: profile.emailVerified,
        name: profile.name,
        picture: profile.picture,
      },
    })

    if (user.email.toLowerCase() === profile.email.toLowerCase()) {
      return prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: user.emailVerifiedAt ?? (profile.emailVerified ? new Date() : undefined),
          name: user.name ?? profile.name,
        },
      })
    }

    return user
  }

  const existingUser = await prisma.user.findUnique({ where: { email: profile.email } })
  if (existingUser) {
    if (!canLinkYandexToExistingEmailUser(existingUser, profile)) {
      throw new Error('yandex_existing_email_requires_step_up')
    }
    return prisma.user.update({
      where: { id: existingUser.id },
      data: {
        emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
        name: existingUser.name ?? profile.name,
        oauthAccounts: {
          create: {
            provider: YANDEX_PROVIDER,
            providerUserId: profile.providerUserId,
            email: profile.email,
            emailVerified: profile.emailVerified,
            name: profile.name,
            picture: profile.picture,
          },
        },
      },
    })
  }

  assertCanCreateYandexUser(allowCreate)
  return createYandexUser(profile, { createOAuthAccount: true, referralCode })
}

function assertCanCreateYandexUser(allowCreate: boolean) {
  if (!allowCreate) throw new Error('yandex_legal_consent_required')
}

function canLinkYandexToExistingEmailUser(
  user: { emailVerifiedAt: Date | null },
  profile: YandexProfile
) {
  return profile.emailVerified && Boolean(user.emailVerifiedAt)
}

async function createYandexUser(
  profile: YandexProfile,
  options: { createOAuthAccount: boolean; referralCode: string | null }
) {
  const referrer = options.referralCode
    ? await prisma.user.findUnique({ where: { referralCode: options.referralCode }, select: { id: true } })
    : null

  const user = await prisma.user.create({
    data: {
      email: profile.email,
      passwordHash: await hash(randomBytes(48).toString('base64url'), 12),
      name: profile.name,
      role: 'USER',
      referralCode: await generateUniqueReferralCode(),
      referredById: referrer?.id,
      agreedToTermsAt: new Date(),
      agreedToTermsVersion: TERMS_VERSION,
      personalDataConsentAt: new Date(),
      personalDataConsentVersion: PERSONAL_DATA_CONSENT_VERSION,
      emailVerifiedAt: new Date(),
      oauthAccounts: options.createOAuthAccount
        ? {
            create: {
              provider: YANDEX_PROVIDER,
              providerUserId: profile.providerUserId,
              email: profile.email,
              emailVerified: profile.emailVerified,
              name: profile.name,
              picture: profile.picture,
            },
          }
        : undefined,
    },
  })
  await createAdminNotification({
    type: 'registration',
    severity: 'INFO',
    dedupeKey: `admin:registration:${user.id}`,
    title: 'Новая регистрация через Яндекс',
    body: `${user.email}${user.name ? `, ${user.name}` : ''}`,
    entityType: 'user',
    entityId: user.id,
    actionHref: '/dashboard/admin/users',
    actionLabel: 'Открыть пользователей',
  })
  return user
}

function clearYandexCookies(response: NextResponse) {
  response.cookies.delete(YANDEX_OAUTH_STATE_COOKIE)
  response.cookies.delete(YANDEX_OAUTH_NEXT_COOKIE)
  response.cookies.delete(YANDEX_OAUTH_REF_COOKIE)
  response.cookies.delete(YANDEX_OAUTH_LEGAL_COOKIE)
  return response
}
