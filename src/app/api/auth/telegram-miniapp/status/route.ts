import { NextResponse } from 'next/server'
import { getSession, setSessionCookieOnResponse } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { syncLinkedTelegramUser } from '@/lib/telegram-link-sync'
import { findCanonicalTelegramSessionUser } from '@/lib/telegram-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: {
      id: true,
      email: true,
      role: true,
      emailVerifiedAt: true,
      telegramId: true,
    },
  })
  if (!user) return NextResponse.json({ authenticated: false }, { status: 401 })
  if (!user.emailVerifiedAt) {
    return NextResponse.json({ authenticated: false, waitingForEmail: true })
  }

  const telegramId = user.telegramId
  if (!telegramId) return NextResponse.json({ authenticated: false }, { status: 401 })
  try {
    await syncLinkedTelegramUser({ localUserId: user.id, telegramId })
  } catch {
    // Login must not be blocked by an optional legacy subscription sync.
  }

  const sessionUser = await findCanonicalTelegramSessionUser({
    telegramId,
    fallbackUserId: user.id,
  })
  if (!sessionUser?.emailVerifiedAt) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  const response = NextResponse.json({ authenticated: true })
  return setSessionCookieOnResponse(response, {
    uid: sessionUser.id,
    email: sessionUser.email,
    role: sessionUser.role,
    stage: 'FULL',
  })
}
