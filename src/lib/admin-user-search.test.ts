import { describe, expect, it } from 'vitest'
import { buildAdminUserSearchFilters } from './admin-user-search'

describe('admin user search', () => {
  it('searches a Telegram username with and without @', () => {
    expect(buildAdminUserSearchFilters('mitfleg')).toContainEqual({
      telegramUsername: { contains: 'mitfleg', mode: 'insensitive' },
    })
    expect(buildAdminUserSearchFilters('@mitfleg')).toContainEqual({
      telegramUsername: { contains: 'mitfleg', mode: 'insensitive' },
    })
  })

  it('searches a numeric Telegram ID without overflowing the database field', () => {
    expect(buildAdminUserSearchFilters('718395003')).toContainEqual({
      telegramId: { equals: BigInt(718395003) },
    })
    expect(buildAdminUserSearchFilters('9999999999999999999')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ telegramId: expect.anything() })])
    )
  })
})
