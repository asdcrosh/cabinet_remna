import { describe, expect, it } from 'vitest'
import {
  SUPPORT_SETTINGS_HREF,
  canEditSupportSettings,
  shouldOpenSupportSettings,
} from './support-settings-access'

describe('support settings access', () => {
  it('lets only admins edit templates and SLA, as the settings API does', () => {
    expect(canEditSupportSettings('ADMIN')).toBe(true)
    expect(canEditSupportSettings('SUPER_ADMIN')).toBe(true)
    expect(canEditSupportSettings('MODERATOR')).toBe(false)
    expect(canEditSupportSettings('USER')).toBe(false)
    expect(canEditSupportSettings(null)).toBe(false)
    expect(canEditSupportSettings(undefined)).toBe(false)
  })

  it('opens the settings window from the System link only for those who may edit', () => {
    expect(SUPPORT_SETTINGS_HREF).toBe('/dashboard/admin/support?settings=1')
    expect(shouldOpenSupportSettings('1', 'ADMIN')).toBe(true)
    expect(shouldOpenSupportSettings('1', 'MODERATOR')).toBe(false)
    expect(shouldOpenSupportSettings(undefined, 'SUPER_ADMIN')).toBe(false)
  })
})
