import { describe, expect, it } from 'vitest'
import { sanitizeInternalNext } from './next-path'

describe('sanitizeInternalNext', () => {
  it('keeps internal paths with query parameters', () => {
    expect(sanitizeInternalNext('/dashboard/plans?promo=COMEBACK')).toBe('/dashboard/plans?promo=COMEBACK')
  })

  it('rejects external redirects', () => {
    expect(sanitizeInternalNext('https://example.com/dashboard')).toBe('/dashboard')
    expect(sanitizeInternalNext('//example.com/dashboard')).toBe('/dashboard')
  })
})
