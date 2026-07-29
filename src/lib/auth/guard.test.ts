import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('./cookies', () => ({ getSession: mocks.getSession }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))

import { AuthError, requireAdmin, requireAuth, requireStaff, requireSuperAdmin, withAuth } from './guard'

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows admin when database role is ADMIN', async () => {
    const session = { uid: 'user-1', email: 'admin@example.com', role: 'ADMIN' as const }
    mocks.getSession.mockResolvedValue(session)
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' })

    await expect(requireAdmin()).resolves.toBe(session)
  })

  it('rejects stale admin session when database role is USER', async () => {
    mocks.getSession.mockResolvedValue({ uid: 'user-1', email: 'admin@example.com', role: 'ADMIN' })
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'USER' })

    await expect(requireAdmin()).rejects.toMatchObject(new AuthError(403, 'Forbidden'))
  })

  it('allows a Telegram-only Mini App session without email verification', async () => {
    const session = {
      uid: 'telegram-user',
      email: 'telegram-user@pending.invalid',
      role: 'USER',
      stage: 'EMAIL_PENDING',
    }
    mocks.getSession.mockResolvedValue(session)

    await expect(requireAuth()).resolves.toBe(session)
  })

  it('allows super admin in admin routes', async () => {
    const session = { uid: 'owner-1', email: 'owner@example.com', role: 'SUPER_ADMIN' as const }
    mocks.getSession.mockResolvedValue(session)
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'SUPER_ADMIN' })

    await expect(requireAdmin()).resolves.toBe(session)
    await expect(requireSuperAdmin()).resolves.toBe(session)
  })

  it('allows moderator only in staff routes', async () => {
    const session = { uid: 'moderator-1', email: 'mod@example.com', role: 'MODERATOR' as const }
    mocks.getSession.mockResolvedValue(session)
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'MODERATOR' })

    await expect(requireStaff()).resolves.toBe(session)
    await expect(requireAdmin()).rejects.toMatchObject(new AuthError(403, 'Forbidden'))
  })
})

describe('withAuth request context', () => {
  it('keeps a valid request ID on the response', async () => {
    const handler = withAuth(async (_request: Request) => NextResponse.json({ ok: true }))
    const response = await handler(new Request('http://localhost/api/test', {
      headers: { 'x-request-id': 'req_guard_12345678' },
    }))

    expect(response.headers.get('x-request-id')).toBe('req_guard_12345678')
  })

  it('replaces an unsafe request ID', async () => {
    const handler = withAuth(async (_request: Request) => NextResponse.json({ ok: true }))
    const response = await handler(new Request('http://localhost/api/test', {
      headers: { 'x-request-id': 'bad id' },
    }))

    expect(response.headers.get('x-request-id')).toMatch(/^[a-f0-9-]{36}$/)
    expect(response.headers.get('x-request-id')).not.toBe('bad id')
  })

  it('adds the request ID to handled authorization errors', async () => {
    const handler = withAuth(async (_request: Request): Promise<NextResponse> => {
      throw new AuthError(403, 'Forbidden')
    })
    const response = await handler(new Request('http://localhost/api/test', {
      headers: { 'x-request-id': 'req_error_12345678' },
    }))

    expect(response.status).toBe(403)
    expect(response.headers.get('x-request-id')).toBe('req_error_12345678')
  })

  it('returns a traceable JSON response for an unexpected failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const handler = withAuth(async (_request: Request): Promise<NextResponse> => {
      throw new Error('database unavailable')
    })
    const response = await handler(new Request('http://localhost/api/test', {
      headers: { 'x-request-id': 'req_failure_12345678' },
    }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Внутренняя ошибка сервера.',
      requestId: 'req_failure_12345678',
    })
    expect(response.headers.get('x-request-id')).toBe('req_failure_12345678')
  })
})
