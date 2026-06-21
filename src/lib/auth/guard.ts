// Помощник для защищённых server actions и API-роутов.
// Если сессии нет — кидаем ошибку с кодом 401.

import { NextResponse } from 'next/server'
import { getSession } from './cookies'
import type { SessionPayload } from './jwt'
import { assertSameOrigin } from '@/lib/security'
import { prisma } from '@/lib/prisma'

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) {
    throw new AuthError(401, 'Unauthorized')
  }
  return session
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { role: true },
  })
  if (user?.role !== 'ADMIN') {
    throw new AuthError(403, 'Forbidden')
  }
  return session
}

// Удобный wrapper для route handlers: ловит AuthError и превращает в JSON-ответ.
export function withAuth<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T
): T {
  return (async (...args: any[]) => {
    try {
      if (args[0] instanceof Request) {
        assertSameOrigin(args[0])
      }
      return await handler(...args)
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status })
      }
      if (e instanceof Error && e.message === 'Invalid request origin') {
        return NextResponse.json({ error: e.message }, { status: 403 })
      }
      throw e
    }
  }) as T
}
