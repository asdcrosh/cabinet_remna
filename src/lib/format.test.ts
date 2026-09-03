import { describe, expect, it } from 'vitest'
import { formatPrice } from './format'

describe('formatPrice', () => {
  it('omits zero kopecks and uses Russian separators', () => {
    expect(formatPrice(13_000)).toBe('130 ₽')
    expect(formatPrice(123_456)).toBe('1 234,56 ₽')
  })

  it('keeps two digits when kopecks are present', () => {
    expect(formatPrice(13_005)).toBe('130,05 ₽')
  })
})
