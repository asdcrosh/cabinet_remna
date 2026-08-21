import { describe, expect, it } from 'vitest'

import { normalizeRemnawaveDeviceLimit } from './remnawave-local-sync'

describe('normalizeRemnawaveDeviceLimit', () => {
  it('keeps a positive per-user HWID limit', () => {
    expect(normalizeRemnawaveDeviceLimit(8)).toBe(8)
  })

  it('stores an absent Remnawave limit as null', () => {
    expect(normalizeRemnawaveDeviceLimit(0)).toBeNull()
    expect(normalizeRemnawaveDeviceLimit(null)).toBeNull()
    expect(normalizeRemnawaveDeviceLimit(undefined)).toBeNull()
  })
})
