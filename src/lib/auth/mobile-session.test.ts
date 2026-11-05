import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-chars'

// База в памяти: проверяем настоящую логику ротации, отзыва и JWT, а не моки ответов.
type Row = {
  id: string
  userId: string
  hwid: string
  refreshHash: string
  prevHash: string | null
  sessionVersion: number
  expiresAt: Date
  revokedAt: Date | null
  revokeReason: string | null
  lastUsedAt: Date
  [key: string]: unknown
}

const db = vi.hoisted(() => ({
  sessions: [] as Row[],
  users: new Map<string, { id: string; email: string; role: 'USER'; sessionVersion: number }>(),
  seq: 0,
  cookie: undefined as string | undefined,
  authorization: null as string | null,
}))

function matches(row: Row, where: Record<string, unknown>) {
  return Object.entries(where).every(([k, v]) => (v === null ? row[k] == null : row[k] === v))
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.users.get(where.id) ?? null),
    },
    revokedSession: { findUnique: vi.fn(async () => null), upsert: vi.fn() },
    mobileSession: {
      create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        const row = { id: `ms-${++db.seq}`, prevHash: null, revokedAt: null, revokeReason: null, lastUsedAt: new Date(), ...data } as Row
        db.sessions.push(row)
        return row
      }),
      findUnique: vi.fn(async ({ where, include }: { where: Record<string, unknown>; include?: unknown }) => {
        const row = db.sessions.find((r) => matches(r, where))
        if (!row) return null
        return include ? { ...row, user: db.users.get(row.userId) } : row
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        const rows = db.sessions.filter((r) => matches(r, where))
        rows.forEach((r) => Object.assign(r, data))
        return { count: rows.length }
      }),
    },
  },
}))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (db.cookie ? { value: db.cookie } : undefined) }),
  headers: async () => new Headers(db.authorization ? { authorization: db.authorization } : {}),
}))

let ms: typeof import('./mobile-session')
let jwt: typeof import('./jwt')
let cookiesMod: typeof import('./cookies')

const user = { id: 'user-1', email: 'user@example.com', role: 'USER' as const }
const device = { hwid: 'hwid-abcdef123456', name: 'Pixel 8', platform: 'android' as const, appVersion: '1.0.0' }
const req = () => new Request('https://cabinet.example/api/mobile/auth/login', { method: 'POST' })

describe('мобильные сессии', () => {
  beforeAll(async () => {
    ms = await import('./mobile-session')
    jwt = await import('./jwt')
    cookiesMod = await import('./cookies')
  })

  beforeEach(() => {
    db.sessions.length = 0
    db.users.clear()
    db.users.set(user.id, { ...user, sessionVersion: 0 })
    db.cookie = undefined
    db.authorization = null
  })

  it('выдаёт токен приложения: aud mobile, sid и короткий срок', async () => {
    const t = await ms.createMobileSession(user, device, req())
    expect(t.tokenType).toBe('Bearer')
    expect(t.expiresIn).toBe(15 * 60)
    const session = await jwt.verifySession(t.accessToken)
    expect(session?.uid).toBe(user.id)
    expect(session && jwt.isMobileSession(session)).toBe(true)
    expect(session!.exp! - session!.iat!).toBe(15 * 60)
    // Refresh в базе хранится только хэшем.
    expect(db.sessions[0]!.refreshHash).toBe(ms.hashRefreshToken(t.refreshToken))
    expect(JSON.stringify(db.sessions[0])).not.toContain(t.refreshToken)
  })

  it('getSession принимает токен приложения по Bearer и не принимает веб-токен', async () => {
    const t = await ms.createMobileSession(user, device, req())
    db.authorization = `Bearer ${t.accessToken}`
    expect((await cookiesMod.getSession())?.uid).toBe(user.id)

    const webToken = await jwt.signSession({ uid: user.id, email: user.email, role: 'USER' })
    db.authorization = `Bearer ${webToken}`
    expect(await cookiesMod.getSession()).toBeNull()

    // Веб-вход по cookie работает как раньше.
    db.authorization = null
    db.cookie = webToken
    expect((await cookiesMod.getSession())?.uid).toBe(user.id)
  })

  it('отзыв сессии сразу делает access-токен недействительным', async () => {
    const t = await ms.createMobileSession(user, device, req())
    db.authorization = `Bearer ${t.accessToken}`
    expect(await cookiesMod.getSession()).not.toBeNull()
    await ms.revokeMobileSession({ sessionId: t.sessionId, userId: user.id })
    expect(await cookiesMod.getSession()).toBeNull()
  })

  it('ротирует refresh: новая пара работает, старый refresh больше не принимается', async () => {
    const t1 = await ms.createMobileSession(user, device, req())
    const r = await ms.rotateMobileSession(t1.refreshToken, device.hwid, req())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tokens.refreshToken).not.toBe(t1.refreshToken)
    expect(await jwt.verifySession(r.tokens.accessToken)).not.toBeNull()

    const again = await ms.rotateMobileSession(r.tokens.refreshToken, device.hwid, req())
    expect(again.ok).toBe(true)
  })

  it('повторное использование старого refresh отзывает сессию целиком', async () => {
    const t1 = await ms.createMobileSession(user, device, req())
    const r = await ms.rotateMobileSession(t1.refreshToken, device.hwid, req())
    if (!r.ok) throw new Error('rotate failed')

    const replay = await ms.rotateMobileSession(t1.refreshToken, device.hwid, req())
    expect(replay).toEqual({ ok: false, reason: 'reused' })
    expect(db.sessions[0]!.revokedAt).toBeInstanceOf(Date)
    // Даже последний выданный refresh и access больше не работают.
    expect((await ms.rotateMobileSession(r.tokens.refreshToken, device.hwid, req())).ok).toBe(false)
    expect(await jwt.verifySession(r.tokens.accessToken)).toBeNull()
  })

  it('refresh с другого устройства отклоняется и отзывает сессию', async () => {
    const t = await ms.createMobileSession(user, device, req())
    const r = await ms.rotateMobileSession(t.refreshToken, 'other-device-123456', req())
    expect(r).toEqual({ ok: false, reason: 'device_mismatch' })
    expect(db.sessions[0]!.revokeReason).toBe('device_mismatch')
  })

  it('«Завершить все сеансы» выводит и приложение', async () => {
    const t = await ms.createMobileSession(user, device, req())
    db.users.get(user.id)!.sessionVersion = 1
    expect(await jwt.verifySession(t.accessToken)).toBeNull()
    expect(await ms.rotateMobileSession(t.refreshToken, device.hwid, req())).toEqual({ ok: false, reason: 'expired' })
  })

  it('истёкшая сессия не обновляется, неизвестный refresh отклоняется', async () => {
    const t = await ms.createMobileSession(user, device, req())
    db.sessions[0]!.expiresAt = new Date(Date.now() - 1000)
    expect(await ms.rotateMobileSession(t.refreshToken, device.hwid, req())).toEqual({ ok: false, reason: 'expired' })
    expect(await ms.rotateMobileSession('x'.repeat(43), device.hwid, req())).toEqual({ ok: false, reason: 'invalid' })
  })

  it('выход по refresh-токену, когда access уже истёк', async () => {
    const t = await ms.createMobileSession(user, device, req())
    expect(await ms.revokeMobileSession({ refreshToken: t.refreshToken })).toBe(true)
    expect(db.sessions[0]!.revokeReason).toBe('logout')
    expect(await ms.revokeMobileSession({ refreshToken: t.refreshToken })).toBe(false)
  })
})
