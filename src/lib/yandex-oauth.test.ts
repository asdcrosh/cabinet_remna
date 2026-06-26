import { describe, expect, it } from 'vitest'
import { sanitizeOAuthNext, sanitizeOAuthReferral } from './yandex-oauth'

describe('yandex oauth helpers', () => {
  it('keeps redirects inside the cabinet', () => {
    expect(sanitizeOAuthNext('/dashboard/plans')).toBe('/dashboard/plans')
    expect(sanitizeOAuthNext('https://example.com')).toBe('/dashboard')
    expect(sanitizeOAuthNext('//example.com/path')).toBe('/dashboard')
    expect(sanitizeOAuthNext('')).toBe('/dashboard')
  })

  it('accepts only compact referral codes', () => {
    expect(sanitizeOAuthReferral('ABC_123')).toBe('ABC_123')
    expect(sanitizeOAuthReferral('bad code')).toBe('')
    expect(sanitizeOAuthReferral('x')).toBe('')
  })
})
