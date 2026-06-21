import { afterEach, describe, expect, it } from 'vitest'
import { assertSameOrigin, isIpAllowed } from './security'

describe('security helpers', () => {
  afterEach(() => {
    delete process.env.APP_URL
    delete process.env.NEXTAUTH_URL
    delete process.env.ALLOWED_ORIGINS
  })

  it('allows any ip when allowlist is empty', () => {
    expect(isIpAllowed('203.0.113.10', [])).toBe(true)
  })

  it('matches exact ip entries', () => {
    expect(isIpAllowed('203.0.113.10', ['203.0.113.10'])).toBe(true)
    expect(isIpAllowed('203.0.113.11', ['203.0.113.10'])).toBe(false)
  })

  it('matches ipv4 cidr entries', () => {
    expect(isIpAllowed('10.10.5.20', ['10.10.0.0/16'])).toBe(true)
    expect(isIpAllowed('10.11.5.20', ['10.10.0.0/16'])).toBe(false)
  })

  it('allows mutation origin that matches request url origin', () => {
    process.env.APP_URL = 'http://localhost:3000'

    const req = new Request('http://127.0.0.1:3000/api/admin/promo-codes', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:3000' },
    })

    expect(() => assertSameOrigin(req)).not.toThrow()
  })

  it('allows mutation origin from forwarded host behind a tunnel', () => {
    process.env.APP_URL = 'http://localhost:3000'

    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        origin: 'https://demo.ngrok-free.app',
        'x-forwarded-host': 'demo.ngrok-free.app',
        'x-forwarded-proto': 'https',
      },
    })

    expect(() => assertSameOrigin(req)).not.toThrow()
  })
})
