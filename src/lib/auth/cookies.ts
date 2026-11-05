// Cookie helpers для Next.js Server Components / Route Handlers.
// Нам нужно httpOnly + Secure (в проде) + SameSite=Lax.
// Параметр `req` опционален — если есть, проставим Path=/Domain привязкой к текущему.

import type { NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { COOKIE_NAME, isMobileSession, signSession, verifySession, type SessionPayload } from './jwt'

export async function setSessionCookie(payload: Omit<SessionPayload, 'iat' | 'exp'>) {
  const token = await signSession(payload)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 дней — синхронизировано с TTL в jwt.ts
  })
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

// То же, но в Route Handler (нужно явно отдавать response с Set-Cookie).
export async function setSessionCookieOnResponse(
  res: NextResponse,
  payload: Omit<SessionPayload, 'iat' | 'exp'>
) {
  const token = await signSession(payload)
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return res
}

export function clearSessionCookieOnResponse(res: NextResponse) {
  res.cookies.delete(COOKIE_NAME)
  return res
}

// Удобный геттер для server components
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (token) return verifySession(token)

  // Приложение StealthNet авторизуется заголовком Authorization: Bearer.
  // Принимаем только токены приложения (aud "mobile" + живая MobileSession), не веб-токены.
  const bearer = readBearerToken((await headers()).get('authorization'))
  if (!bearer) return null
  const session = await verifySession(bearer)
  return session && isMobileSession(session) ? session : null
}

export function readBearerToken(value: string | null | undefined) {
  const match = value?.match(/^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/i)
  return match ? match[1] : null
}

export async function getCurrentUser() {
  const session = await getSession()
  if (!session) return null
  // Можно дополнительно дёрнуть Prisma для свежести, но в большинстве мест
  // сессионного payload'а достаточно.
  return session
}
