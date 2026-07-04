// JWT-утилиты поверх jose (поддерживает Edge/Node, не использует node:crypto).
// Храним токен в httpOnly cookie — JS из браузера его не видит,
// что закрывает XSS-кражу. CSRF закрываем тем, что cookie SameSite=Lax
// и mutation-роуты проверяют Origin через assertSameOrigin.
import { randomUUID } from 'node:crypto'
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { logWarn } from '../logger'
import { prisma } from '../prisma'

const JWT_SECRET_MIN_LENGTH = 32
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < JWT_SECRET_MIN_LENGTH) {
  // Не throw-аем: пусть билд пройдёт, но в проде упадёт на первом запросе.
  logWarn('auth.jwt_secret_missing', { length: process.env.JWT_SECRET?.length ?? 0 })
}

const ALG = 'HS256'
const ACCESS_TTL = '7d'

export interface SessionPayload extends JWTPayload {
  uid: string
  email: string
  role: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'
  stage?: 'FULL' | 'EMAIL_PENDING'
}

export const COOKIE_NAME = 'cabinet_session'

export async function signSession(payload: Omit<SessionPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .setIssuer('remnawave-cabinet')
    .setJti(randomUUID())
    .sign(getSecretKey())
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: 'remnawave-cabinet',
    })
    if (typeof payload.jti === 'string') {
      const revoked = await prisma.revokedSession.findUnique({
        where: { jti: payload.jti },
        select: { id: true },
      })
      if (revoked) return null
    }
    return payload as SessionPayload
  } catch {
    return null
  }
}

export async function revokeSessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: 'remnawave-cabinet',
    })
    if (typeof payload.jti !== 'string') return false

    const expiresAt =
      typeof payload.exp === 'number'
        ? new Date(payload.exp * 1000)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await prisma.revokedSession.upsert({
      where: { jti: payload.jti },
      create: {
        jti: payload.jti,
        userId: typeof payload.uid === 'string' ? payload.uid : null,
        expiresAt,
      },
      update: {
        revokedAt: new Date(),
        expiresAt,
      },
    })
    return true
  } catch {
    return false
  }
}

function getSecretKey() {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error('JWT_SECRET must be at least 32 characters')
  }
  return new TextEncoder().encode(secret)
}
