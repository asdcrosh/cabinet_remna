import { describe, expect, it } from 'vitest'

import {
  normalizeRemnawaveDeviceLimit,
  shouldReplacePlanFromExternalSync,
} from './remnawave-local-sync'

describe('shouldReplacePlanFromExternalSync', () => {
  it('does not overwrite a plan managed by the cabinet', () => {
    expect(shouldReplacePlanFromExternalSync({ planManagedByCabinet: true }, 'legacy-plan')).toBe(false)
  })

  it('fills or refreshes a plan still managed by external synchronization', () => {
    expect(shouldReplacePlanFromExternalSync(null, 'legacy-plan')).toBe(true)
    expect(shouldReplacePlanFromExternalSync({ planManagedByCabinet: false }, 'legacy-plan')).toBe(true)
    expect(shouldReplacePlanFromExternalSync({ planManagedByCabinet: false }, null)).toBe(false)
  })
})

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
