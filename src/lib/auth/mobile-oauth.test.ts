import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-chars'

type CodeRow = {
  id: string
  codeHash: string
  userId: string
  codeChallenge: string
  hwid: string
  deviceName: string | null
  platform: string | null
  appVersion: string | null
  expiresAt: Date
  usedAt: Date | null
  telegramId?: bigint
}

const db = vi.hoisted(() => ({ codes: [] as CodeRow[], seq: 0, deadline: null as Date | null }))
const user = { id: 'user-1', email: 'user@example.com', name: 'User', role: 'USER' as const }

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({ sessionVersion: 0 })),
      updateMany: vi.fn(async ({ where, data }) => {
        if (where.mobileTelegramEmailDueAt === null && db.deadline !== null) return { count: 0 }
        db.deadline = data.mobileTelegramEmailDueAt
        return { count: 1 }
      }),
    },
    revokedSession: { findUnique: vi.fn(async () => null) },
    mobileAuthCode: {
      create: vi.fn(async ({ data }: { data: Omit<CodeRow, 'id' | 'usedAt'> }) => {
        const row = { id: `code-${++db.seq}`, usedAt: null, ...data } as CodeRow
        db.codes.push(row)
        return row
      }),
      findUnique: vi.fn(async ({ where }: { where: { codeHash: string } }) => {
        const row = db.codes.find((c) => c.codeHash === where.codeHash)
        return row ? { ...row, user: { ...user, telegramId: 12n, emailVerifiedAt: null } } : null
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; usedAt: null }; data: Partial<CodeRow> }) => {
        const rows = db.codes.filter((c) => c.id === where.id && c.usedAt === null)
        rows.forEach((c) => Object.assign(c, data))
        return { count: rows.length }
      }),
    },
  },
}))

let oauth: typeof import('./mobile-oauth')
let jwt: typeof import('./jwt')

// RFC 7636, приложение B.
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
const device = { hwid: 'hwid-abcdef123456', name: 'Pixel 8', platform: 'android' as const, appVersion: '1.0.0' }

describe('вход в приложение через браузер (PKCE)', () => {
  beforeAll(async () => {
    oauth = await import('./mobile-oauth')
    jwt = await import('./jwt')
  })

  beforeEach(() => {
    db.codes.length = 0
    db.deadline = null
  })

  it('S256 соответствует тестовому вектору RFC 7636', () => {
    expect(oauth.pkceChallengeFromVerifier(VERIFIER)).toBe(CHALLENGE)
  })

  it('намерение входа подписано: подделка и чужие токены не принимаются', async () => {
    const token = await oauth.signMobileOAuthIntent({ codeChallenge: CHALLENGE, device })
    expect(await oauth.verifyMobileOAuthIntent(token)).toEqual({ codeChallenge: CHALLENGE, device })

    const [h, p, s] = token.split('.')
    const forged = JSON.parse(Buffer.from(p!, 'base64url').toString())
    forged.codeChallenge = 'A'.repeat(43)
    const tampered = `${h}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${s}`
    expect(await oauth.verifyMobileOAuthIntent(tampered)).toBeNull()

    // Сессионный JWT кабинета не подходит как намерение (другая аудитория).
    const sessionToken = await jwt.signSession({ uid: user.id, email: user.email, role: 'USER' })
    expect(await oauth.verifyMobileOAuthIntent(sessionToken)).toBeNull()
    expect(await oauth.verifyMobileOAuthIntent(undefined)).toBeNull()
  })

  it('код меняется на пользователя и устройство ровно один раз', async () => {
    const code = await oauth.createMobileAuthCode(user.id, { codeChallenge: CHALLENGE, device })
    // В базе только хэш кода.
    expect(JSON.stringify(db.codes)).not.toContain(code)

    const first = await oauth.exchangeMobileAuthCode(code, VERIFIER, device.hwid)
    expect(first).toEqual({ ok: true, user, device })
    expect(await oauth.exchangeMobileAuthCode(code, VERIFIER, device.hwid)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('без правильного code_verifier код бесполезен и не сгорает', async () => {
    const code = await oauth.createMobileAuthCode(user.id, { codeChallenge: CHALLENGE, device })
    expect(await oauth.exchangeMobileAuthCode(code, 'x'.repeat(43), device.hwid)).toEqual({ ok: false, reason: 'verifier_mismatch' })
    expect((await oauth.exchangeMobileAuthCode(code, VERIFIER, device.hwid)).ok).toBe(true)
  })

  it('код с другого устройства и истёкший код отклоняются', async () => {
    const code = await oauth.createMobileAuthCode(user.id, { codeChallenge: CHALLENGE, device })
    expect(await oauth.exchangeMobileAuthCode(code, VERIFIER, 'other-device-123456')).toEqual({ ok: false, reason: 'device_mismatch' })

    const old = await oauth.createMobileAuthCode(user.id, { codeChallenge: CHALLENGE, device })
    db.codes.at(-1)!.expiresAt = new Date(Date.now() - 1000)
    expect(await oauth.exchangeMobileAuthCode(old, VERIFIER, device.hwid)).toEqual({ ok: false, reason: 'expired' })
    expect(await oauth.exchangeMobileAuthCode('unknown-code-xxxxxxxxxxxxx', VERIFIER, device.hwid)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('срок начинается при обмене кода и сохраняется при повторном Telegram-входе', async () => {
    const code = await oauth.createMobileAuthCode(user.id, { codeChallenge: CHALLENGE, device }, 12n)
    expect(db.deadline).toBeNull()
    const before = Date.now()
    expect((await oauth.exchangeMobileAuthCode(code, VERIFIER, device.hwid)).ok).toBe(true)
    const deadline = db.deadline
    expect(deadline!.getTime() - before).toBeGreaterThanOrEqual(3 * 24 * 60 * 60_000)
    const again = await oauth.createMobileAuthCode(user.id, { codeChallenge: CHALLENGE, device }, 12n)
    expect((await oauth.exchangeMobileAuthCode(again, VERIFIER, device.hwid)).ok).toBe(true)
    expect(db.deadline).toBe(deadline)
  })
})
