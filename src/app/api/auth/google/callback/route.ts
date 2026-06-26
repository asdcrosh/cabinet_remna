import { randomBytes } from 'node:crypto'
import { hash } from 'bcryptjs'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { setSessionCookieOnResponse } from '@/lib/auth/cookies'
import { getAppUrlOrRequestOrigin } from '@/lib/app-url'
import { checkRemnawaveProfileOnLogin } from '@/lib/remnawave-profile-check'
import { generateUniqueReferralCode, normalizeReferralCode } from '@/lib/referrals'
import {
  exchangeGoogleCode,
  GOOGLE_OAUTH_NEXT_COOKIE,
  GOOGLE_OAUTH_REF_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  sanitizeOAuthNext,
  verifyGoogleIdToken,
  type GoogleProfile,
} from '@/lib/google-oauth'

export const runtime = 'nodejs'

const GOOGLE_PROVIDER = 'google'

export async function GET(req: Request) {
  const requestUrl = new URL(req.url)
  const baseUrl = getAppUrlOrRequestOrigin(req)
  const next = sanitizeOAuthNext(cookies().get(GOOGLE_OAUTH_NEXT_COOKIE)?.value)
  const successUrl = new URL(next, baseUrl)
  const errorUrl = new URL('/login', baseUrl)

  const providerError = requestUrl.searchParams.get('error')
  if (providerError) {
    errorUrl.searchParams.set('google_error', providerError)
    return clearGoogleCookies(NextResponse.redirect(errorUrl))
  }

  const code = requestUrl.searchParams.get('code')
  const state = requestUrl.searchParams.get('state')
  const expectedState = cookies().get(GOOGLE_OAUTH_STATE_COOKIE)?.value

  if (!code || !state || !expectedState || state !== expectedState) {
    errorUrl.searchParams.set('google_error', 'invalid_state')
    return clearGoogleCookies(NextResponse.redirect(errorUrl))
  }

  try {
    const tokenResponse = await exchangeGoogleCode(code)
    const profile = await verifyGoogleIdToken(tokenResponse.idToken)

    if (!profile.emailVerified) {
      errorUrl.searchParams.set('google_error', 'email_not_verified')
      return clearGoogleCookies(NextResponse.redirect(errorUrl))
    }

    const user = await findOrCreateGoogleUser(profile)

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
    return clearGoogleCookies(response)
  } catch (error) {
    console.warn('[auth/google] callback failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    errorUrl.searchParams.set('google_error', 'google_auth_failed')
    return clearGoogleCookies(NextResponse.redirect(errorUrl))
  }
}

async function findOrCreateGoogleUser(profile: GoogleProfile) {
  const existingAccount = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider: GOOGLE_PROVIDER,
        providerUserId: profile.providerUserId,
      },
    },
    include: { user: true },
  })

  if (existingAccount) {
    await prisma.oAuthAccount.update({
      where: { id: existingAccount.id },
      data: {
        email: profile.email,
        emailVerified: profile.emailVerified,
        name: profile.name,
        picture: profile.picture,
      },
    })
    return existingAccount.user
  }

  const existingUser = await prisma.user.findUnique({ where: { email: profile.email } })
  if (existingUser) {
    const user = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
        agreedToTermsAt: existingUser.agreedToTermsAt ?? new Date(),
        name: existingUser.name ?? profile.name,
        oauthAccounts: {
          create: {
            provider: GOOGLE_PROVIDER,
            providerUserId: profile.providerUserId,
            email: profile.email,
            emailVerified: profile.emailVerified,
            name: profile.name,
            picture: profile.picture,
          },
        },
      },
    })
    return user
  }

  const referralCode = normalizeReferralCode(cookies().get(GOOGLE_OAUTH_REF_COOKIE)?.value)
  const referrer = referralCode
    ? await prisma.user.findUnique({ where: { referralCode }, select: { id: true } })
    : null

  return prisma.user.create({
    data: {
      email: profile.email,
      passwordHash: await hash(randomBytes(48).toString('base64url'), 12),
      name: profile.name,
      role: 'USER',
      referralCode: await generateUniqueReferralCode(),
      referredById: referrer?.id,
      agreedToTermsAt: new Date(),
      emailVerifiedAt: new Date(),
      oauthAccounts: {
        create: {
          provider: GOOGLE_PROVIDER,
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

function clearGoogleCookies(response: NextResponse) {
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE)
  response.cookies.delete(GOOGLE_OAUTH_NEXT_COOKIE)
  response.cookies.delete(GOOGLE_OAUTH_REF_COOKIE)
  return response
}
