import { describe, expect, it } from 'vitest'
import { nextTabIndex } from './tab-keyboard'

describe('tab keyboard navigation', () => {
  it('moves between tabs and wraps at the edges', () => {
    expect(nextTabIndex(0, 3, 'ArrowRight')).toBe(1)
    expect(nextTabIndex(2, 3, 'ArrowRight')).toBe(0)
    expect(nextTabIndex(0, 3, 'ArrowLeft')).toBe(2)
  })

  it('supports Home and End', () => {
    expect(nextTabIndex(1, 3, 'Home')).toBe(0)
    expect(nextTabIndex(1, 3, 'End')).toBe(2)
    expect(nextTabIndex(1, 3, 'Enter')).toBeNull()
  })
})
