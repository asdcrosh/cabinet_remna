import { describe, expect, it } from 'vitest'
import { NextResponse } from 'next/server'
import { jsonResponse } from './json-response'

describe('jsonResponse', () => {
  it('serializes nested and future BigInt fields without losing precision or changing the source', async () => {
    const huge = 900719925474099312345678901234567890n
    const body = { payments: [{ subscription: { reward: 0n, futureBalance: huge } }], ids: [1n, -2n] }
    const response = jsonResponse(body)

    await expect(response.json()).resolves.toEqual({
      payments: [{ subscription: { reward: '0', futureBalance: huge.toString() } }], ids: ['1', '-2'],
    })
    expect(body.payments[0]!.subscription.futureBalance).toBe(huge)
    expect(() => JSON.stringify({ value: huge })).toThrow(TypeError)
  })

  it('preserves native JSON behavior for dates, nulls and optional values', async () => {
    const body = { date: new Date('2026-10-27T20:45:54.000Z'), absent: undefined,
      nullable: null, enabled: true, amount: 100, invalid: Number.NaN, items: [undefined, 'ok'] }
    const response = jsonResponse(body)
    expect(await response.text()).toBe(await NextResponse.json(body).text())
    expect(response.headers.get('content-type')).toBe('application/json')
  })

  it('keeps status, headers and NextResponse cookie support', async () => {
    const headers = new Headers({ 'content-type': 'application/problem+json', 'x-request-id': 'test-request' })
    const response = jsonResponse({ value: 3n }, { status: 201, statusText: 'Created', headers })
    response.cookies.set('session', 'test', { httpOnly: true, secure: true, sameSite: 'lax' })

    expect(response.status).toBe(201)
    expect(response.statusText).toBe('Created')
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(response.headers.get('x-request-id')).toBe('test-request')
    expect(response.cookies.get('session')?.value).toBe('test')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    await expect(response.json()).resolves.toEqual({ value: '3' })
  })

  it('supports a root BigInt and custom toJSON values', async () => {
    await expect(jsonResponse(123n).json()).resolves.toBe('123')
    await expect(jsonResponse({ toJSON: () => ({ count: 7n }) }).json()).resolves.toEqual({ count: '7' })
  })

  it('keeps rejecting non-JSON payloads rather than hiding unrelated defects', () => {
    expect(() => jsonResponse(undefined)).toThrow(TypeError)
    const circular: { self?: unknown } = {}
    circular.self = circular
    expect(() => jsonResponse(circular)).toThrow(TypeError)
  })
})
