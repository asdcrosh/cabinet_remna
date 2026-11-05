// Вход в приложение StealthNet через браузер (Яндекс ID и другие провайдеры кабинета).
//
// 1. Приложение открывает /api/mobile/auth/oauth/start с code_challenge (PKCE S256) и данными устройства.
//    Кабинет сохраняет «намерение входа» в подписанной httpOnly-cookie браузера и запускает обычный OAuth.
// 2. После входа /api/mobile/auth/oauth/complete выдаёт одноразовый код (2 минуты)
//    и возвращает браузер в приложение: stealthnet://oauth?code=…
// 3. Приложение меняет код на токены в /api/mobile/auth/oauth/exchange, предъявляя code_verifier.
//    Перехваченный код без verifier бесполезен.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getAuthSigningKey, type SessionPayload } from './jwt'
import { mobileDeviceSchema, type MobileDevice } from './mobile-session'

export const MOBILE_OAUTH_INTENT_COOKIE = 'mobile_oauth_intent'
export const MOBILE_OAUTH_INTENT_TTL_SECONDS = 10 * 60
export const MOBILE_AUTH_CODE_TTL_MS = 2 * 60 * 1000
export const MOBILE_APP_RETURN_URL = 'stealthnet://oauth'

const INTENT_AUDIENCE = 'mobile-oauth-intent'
const ISSUER = 'remnawave-cabinet'

// RFC 7636: code_challenge = BASE64URL(SHA256(code_verifier)), 43 символа.
export const codeChallengeSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Некорректный code_challenge')
export const codeVerifierSchema = z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/, 'Некорректный code_verifier')

export type MobileOAuthIntent = {
  codeChallenge: string
  device: MobileDevice
}

const intentSchema = z.object({ codeChallenge: codeChallengeSchema, device: mobileDeviceSchema })

export async function signMobileOAuthIntent(intent: MobileOAuthIntent) {
  return new SignJWT({ codeChallenge: intent.codeChallenge, device: intent.device })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(INTENT_AUDIENCE)
    .setExpirationTime(`${MOBILE_OAUTH_INTENT_TTL_SECONDS}s`)
    .sign(getAuthSigningKey())
}

export async function verifyMobileOAuthIntent(token: string | undefined | null): Promise<MobileOAuthIntent | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getAuthSigningKey(), { issuer: ISSUER, audience: INTENT_AUDIENCE })
    const parsed = intentSchema.safeParse(payload)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function hashCode(code: string) {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

export function pkceChallengeFromVerifier(verifier: string) {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}

export async function createMobileAuthCode(userId: string, intent: MobileOAuthIntent) {
  const code = randomBytes(32).toString('base64url')
  await prisma.mobileAuthCode.create({
    data: {
      codeHash: hashCode(code),
      userId,
      codeChallenge: intent.codeChallenge,
      hwid: intent.device.hwid,
      deviceName: intent.device.name ?? null,
      platform: intent.device.platform ?? null,
      appVersion: intent.device.appVersion ?? null,
      expiresAt: new Date(Date.now() + MOBILE_AUTH_CODE_TTL_MS),
    },
  })
  return code
}

export type ExchangeResult =
  | { ok: true; user: { id: string; email: string; name: string | null; role: SessionPayload['role'] }; device: MobileDevice }
  | { ok: false; reason: 'invalid' | 'expired' | 'verifier_mismatch' | 'device_mismatch' }

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export async function exchangeMobileAuthCode(code: string, codeVerifier: string, hwid: string): Promise<ExchangeResult> {
  const row = await prisma.mobileAuthCode.findUnique({
    where: { codeHash: hashCode(code) },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  })
  if (!row || row.usedAt) return { ok: false, reason: 'invalid' }
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' }
  if (!safeEqual(pkceChallengeFromVerifier(codeVerifier), row.codeChallenge)) {
    return { ok: false, reason: 'verifier_mismatch' }
  }
  if (row.hwid !== hwid) return { ok: false, reason: 'device_mismatch' }

  // Код одноразовый: помечаем использованным атомарно, второй обмен получит invalid.
  const used = await prisma.mobileAuthCode.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  })
  if (used.count !== 1) return { ok: false, reason: 'invalid' }

  return {
    ok: true,
    user: row.user,
    device: {
      hwid: row.hwid,
      name: row.deviceName ?? undefined,
      platform: (row.platform ?? undefined) as MobileDevice['platform'],
      appVersion: row.appVersion ?? undefined,
    },
  }
}
