import { describe, expect, it } from 'vitest'
import { parseAdminListLimit } from './admin-list'

describe('parseAdminListLimit', () => {
  it('uses the first batch for invalid values', () => {
    expect(parseAdminListLimit(undefined)).toBe(25)
    expect(parseAdminListLimit('0')).toBe(25)
    expect(parseAdminListLimit('wrong')).toBe(25)
  })

  it('rounds limits to complete batches and caps excessive values', () => {
    expect(parseAdminListLimit('26')).toBe(50)
    expect(parseAdminListLimit('5001')).toBe(5000)
  })
})
