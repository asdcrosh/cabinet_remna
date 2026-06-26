import { randomBytes } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { getAppUrl } from './app-url'

export const GOOGLE_OAUTH_STATE_COOKIE = 'google_oauth_state'
export const GOOGLE_OAUTH_NEXT_COOKIE = 'google_oauth_next'
export const GOOGLE_OAUTH_REF_COOKIE = 'google_oauth_ref'

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

export interface GoogleProfile {
  providerUserId: string
  email: string
  emailVerified: boolean
  name: string | null
  picture: string | null
}

export function getGoogleRedirectUri() {
  return new URL('/api/auth/google/callback', getAppUrl()).toString()
}

export function createGoogleOAuthState() {
  return randomBytes(24).toString('base64url')
}

export function getGoogleOAuthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  }
}

export function buildGoogleAuthUrl(input: { state: string }) {
  const clientId = getGoogleClientId()
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', getGoogleRedirectUri())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', input.state)
  url.searchParams.set('prompt', 'select_account')
  return url
}

export async function exchangeGoogleCode(code: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getGoogleRedirectUri(),
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
    }),
  })

  const data = (await response.json().catch(() => null)) as {
    id_token?: string
    error?: string
    error_description?: string
  } | null

  if (!response.ok || !data?.id_token) {
    throw new Error(data?.error_description || data?.error || 'google_token_exchange_failed')
  }

  return { idToken: data.id_token }
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const { payload } = await jwtVerify(idToken, googleJwks, {
    audience: getGoogleClientId(),
    issuer: GOOGLE_ISSUERS,
  })

  const providerUserId = typeof payload.sub === 'string' ? payload.sub : ''
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : ''
  const emailVerified = payload.email_verified === true

  if (!providerUserId || !email) {
    throw new Error('google_profile_missing_required_fields')
  }

  return {
    providerUserId,
    email,
    emailVerified,
    name: typeof payload.name === 'string' ? payload.name : null,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
  }
}

export function sanitizeOAuthNext(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}

export function sanitizeOAuthReferral(value: string | null | undefined) {
  const code = value?.trim()
  if (!code) return ''
  return /^[A-Za-z0-9_-]{3,32}$/.test(code) ? code : ''
}

function getGoogleClientId() {
  const value = process.env.GOOGLE_CLIENT_ID?.trim()
  if (!value) throw new Error('GOOGLE_CLIENT_ID is not configured')
  return value
}

function getGoogleClientSecret() {
  const value = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (!value) throw new Error('GOOGLE_CLIENT_SECRET is not configured')
  return value
}
