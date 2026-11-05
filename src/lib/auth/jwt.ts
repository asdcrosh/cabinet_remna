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
  sv?: number
  // Только у токенов приложения: id записи MobileSession.
  sid?: string
}

export const COOKIE_NAME = 'cabinet_session'

// Токены приложения StealthNet: короткий срок, отдельная аудитория и привязка к MobileSession.
export const MOBILE_AUDIENCE = 'mobile'
export const MOBILE_ACCESS_TTL_SECONDS = 15 * 60

type SignSessionOptions = {
  // Для токена приложения: id MobileSession. Задаёт aud "mobile" и срок 15 минут.
  mobileSessionId?: string
}

export async function signSession(
  payload: Omit<SessionPayload, 'iat' | 'exp' | 'sv' | 'sid' | 'aud'>,
  options: SignSessionOptions = {}
): Promise<string> {
  if (typeof payload.uid !== 'string') throw new Error('Session user id is required')
  const sessionVersion = await getUserSessionVersion(payload.uid)
  const mobile = typeof options.mobileSessionId === 'string'

  const jwt = new SignJWT({
    ...payload,
    sv: sessionVersion,
    ...(mobile ? { sid: options.mobileSessionId } : {}),
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(mobile ? `${MOBILE_ACCESS_TTL_SECONDS}s` : ACCESS_TTL)
    .setIssuer('remnawave-cabinet')
    .setJti(randomUUID())
  if (mobile) jwt.setAudience(MOBILE_AUDIENCE)
  return jwt.sign(getSecretKey())
}

export function isMobileSession(session: Pick<SessionPayload, 'aud' | 'sid'>) {
  const aud = Array.isArray(session.aud) ? session.aud : [session.aud]
  return aud.includes(MOBILE_AUDIENCE) && typeof session.sid === 'string'
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: 'remnawave-cabinet',
    })
    if (typeof payload.uid !== 'string') return null

    const [revoked, user] = await Promise.all([
      typeof payload.jti === 'string'
        ? prisma.revokedSession.findUnique({
            where: { jti: payload.jti },
            select: { id: true },
          })
        : null,
      prisma.user.findUnique({
        where: { id: payload.uid },
        select: { sessionVersion: true },
      }),
    ])
    if (revoked || !user || (payload.sv ?? 0) !== user.sessionVersion) return null

    // Токен приложения действителен, только пока его MobileSession не отозвана и не истекла:
    // отзыв устройства срабатывает сразу, без ожидания конца 15 минут.
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (aud.includes(MOBILE_AUDIENCE)) {
      if (typeof payload.sid !== 'string') return null
      const mobileSession = await prisma.mobileSession.findUnique({
        where: { id: payload.sid },
        select: { userId: true, revokedAt: true, expiresAt: true },
      })
      if (
        !mobileSession ||
        mobileSession.userId !== payload.uid ||
        mobileSession.revokedAt ||
        mobileSession.expiresAt.getTime() <= Date.now()
      ) {
        return null
      }
    }
    return payload as SessionPayload
  } catch {
    return null
  }
}

async function getUserSessionVersion(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true },
  })
  if (!user) throw new Error('Cannot create session for missing user')
  return user.sessionVersion
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
