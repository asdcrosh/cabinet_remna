// Cookie helpers для Next.js Server Components / Route Handlers.
// Нам нужно httpOnly + Secure (в проде) + SameSite=Lax.
// Параметр `req` опционален — если есть, проставим Path=/Domain привязкой к текущему.

import type { ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import type { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE_NAME, signSession, verifySession, type SessionPayload } from './jwt'

export async function setSessionCookie(payload: Omit<SessionPayload, 'iat' | 'exp'>) {
  const token = await signSession(payload)
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 дней — синхронизировано с TTL в jwt.ts
  })
}

export function clearSessionCookie() {
  cookies().delete(COOKIE_NAME)
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
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySession(token)
}

export async function getCurrentUser() {
  const session = await getSession()
  if (!session) return null
  // Можно дополнительно дёрнуть Prisma для свежести, но в большинстве мест
  // сессионного payload'а достаточно.
  return session
}
