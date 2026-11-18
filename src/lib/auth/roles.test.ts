import { describe, expect, it } from 'vitest'
import { isAdminRole, isStaffRole } from './roles'

describe('role checks', () => {
  it('treats only ADMIN and SUPER_ADMIN as administrators', () => {
    expect(isAdminRole('SUPER_ADMIN')).toBe(true)
    expect(isAdminRole('ADMIN')).toBe(true)
    expect(isAdminRole('MODERATOR')).toBe(false)
    expect(isAdminRole('USER')).toBe(false)
    expect(isAdminRole(null)).toBe(false)
    expect(isAdminRole(undefined)).toBe(false)
  })

  it('treats moderators and administrators as staff', () => {
    expect(isStaffRole('MODERATOR')).toBe(true)
    expect(isStaffRole('ADMIN')).toBe(true)
    expect(isStaffRole('SUPER_ADMIN')).toBe(true)
    expect(isStaffRole('USER')).toBe(false)
    expect(isStaffRole('')).toBe(false)
  })
})
