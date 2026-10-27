import { jsonResponse } from '@/lib/json-response'
import { getSession, setSessionCookieOnResponse } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { findCanonicalTelegramSessionUser } from '@/lib/telegram-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return jsonResponse({ authenticated: false }, { status: 401 })

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
  if (!user) return jsonResponse({ authenticated: false }, { status: 401 })
  if (!user.emailVerifiedAt) {
    return jsonResponse({ authenticated: false, waitingForEmail: true })
  }

  const telegramId = user.telegramId
  if (!telegramId) return jsonResponse({ authenticated: false }, { status: 401 })

  const sessionUser = await findCanonicalTelegramSessionUser({
    telegramId,
    fallbackUserId: user.id,
  })
  if (!sessionUser?.emailVerifiedAt) {
    return jsonResponse({ authenticated: false }, { status: 401 })
  }

  const response = jsonResponse({ authenticated: true })
  return setSessionCookieOnResponse(response, {
    uid: sessionUser.id,
    email: sessionUser.email,
    role: sessionUser.role,
    stage: 'FULL',
  })
}
