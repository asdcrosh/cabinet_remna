import { describe, expect, it } from 'vitest'
import { getTelegramBackTarget } from './telegram-back-navigation'

describe('getTelegramBackTarget', () => {
  it('hides the Telegram back button on the cabinet home and outside the cabinet', () => {
    expect(getTelegramBackTarget('/dashboard')).toBeNull()
    expect(getTelegramBackTarget('/dashboard/')).toBeNull()
    expect(getTelegramBackTarget('/login')).toBeNull()
    expect(getTelegramBackTarget('/miniapp')).toBeNull()
    expect(getTelegramBackTarget('/dashboard-legacy')).toBeNull()
  })

  it('returns to the cabinet home from a top-level section', () => {
    expect(getTelegramBackTarget('/dashboard/subscription')).toBe('/dashboard')
    expect(getTelegramBackTarget('/dashboard/support/')).toBe('/dashboard')
    expect(getTelegramBackTarget('/dashboard/admin')).toBe('/dashboard')
  })

  it('goes one level up from nested pages', () => {
    expect(getTelegramBackTarget('/dashboard/admin/users')).toBe('/dashboard/admin')
    expect(getTelegramBackTarget('/dashboard/admin/users/e2e-basic-user')).toBe('/dashboard/admin/users')
  })
})
