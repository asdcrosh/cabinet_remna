// Помощник для защищённых server actions и API-роутов.
// Если сессии нет — кидаем ошибку с кодом 401.

import { NextResponse } from 'next/server'
import { getSession } from './cookies'
import type { SessionPayload } from './jwt'
import { assertSameOrigin } from '@/lib/security'
import { prisma } from '@/lib/prisma'
import { logError, withRequestLogContext } from '@/lib/logger'
import { buildServerErrorDiagnostics } from '@/lib/error-diagnostics'

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
  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    throw new AuthError(403, 'Forbidden')
  }
  return session
}

export async function requireStaff(): Promise<SessionPayload> {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { role: true },
  })
  if (!user || !['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    throw new AuthError(403, 'Forbidden')
  }
  return session
}

export async function requireSuperAdmin(): Promise<SessionPayload> {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { role: true },
  })
  if (user?.role !== 'SUPER_ADMIN') {
    throw new AuthError(403, 'Forbidden')
  }
  return session
}

// Удобный wrapper для route handlers: ловит AuthError и превращает в JSON-ответ.
export function withAuth<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T
): T {
  return (async (...args: any[]) => {
    const request = args[0] instanceof Request ? args[0] : null
    const requestId = request ? resolveRequestId(request) : undefined
    const run = async () => {
      try {
        if (request) assertSameOrigin(request)
        return await handler(...args)
      } catch (e) {
        if (e instanceof AuthError) {
          return NextResponse.json({ error: e.message }, { status: e.status })
        }
        if (e instanceof Error && e.message === 'Invalid request origin') {
          return NextResponse.json({ error: e.message }, { status: 403 })
        }
        logError('api.request_failed', e, {
          method: request?.method,
          path: request ? new URL(request.url).pathname : undefined,
        })
        const details = request ? await getAdminErrorDetails(request, e) : undefined
        return NextResponse.json(
          {
            error: 'Внутренняя ошибка сервера.',
            ...(details ? { details } : {}),
            ...(requestId ? { requestId } : {}),
          },
          { status: 500 }
        )
      }
    }
    const response = requestId
      ? await withRequestLogContext({ requestId }, run)
      : await run()
    if (requestId) response.headers.set('x-request-id', requestId)
    return response
  }) as T
}

async function getAdminErrorDetails(request: Request, error: unknown) {
  if (!new URL(request.url).pathname.startsWith('/api/admin/')) return undefined
  try {
    const session = await getSession()
    if (!session || !['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(session.role)) return undefined
    return buildServerErrorDiagnostics(error)
  } catch {
    return undefined
  }
}

function resolveRequestId(request: Request) {
  const incoming = request.headers.get('x-request-id')?.trim()
  if (incoming && /^[a-zA-Z0-9._:-]{8,128}$/.test(incoming)) return incoming
  return crypto.randomUUID()
}
