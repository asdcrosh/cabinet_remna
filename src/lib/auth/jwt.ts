// JWT-утилиты поверх jose (поддерживает Edge/Node, не использует node:crypto).
// Храним токен в httpOnly cookie — JS из браузера его не видит,
// что закрывает XSS-кражу. CSRF закрываем тем, что cookie SameSite=Lax
// и mutation-роуты проверяют Origin через assertSameOrigin.
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const SECRET = process.env.JWT_SECRET
if (!SECRET || SECRET.length < 32) {
  // Не throw-аем: пусть билд пройдёт, но в проде упадёт на первом запросе.
  console.warn('[auth] JWT_SECRET is missing or too short — auth will fail')
}

const ALG = 'HS256'
const ACCESS_TTL = '7d'

export interface SessionPayload extends JWTPayload {
  uid: string
  email: string
  role: 'USER' | 'ADMIN'
}

export const COOKIE_NAME = 'cabinet_session'

export async function signSession(payload: Omit<SessionPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .setIssuer('remnawave-cabinet')
    .sign(getSecretKey())
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: 'remnawave-cabinet',
    })
    return payload as SessionPayload
  } catch {
    return null
  }
}

function getSecretKey() {
  if (!SECRET || SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters')
  }
  return new TextEncoder().encode(SECRET)
}
