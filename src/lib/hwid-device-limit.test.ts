import { describe, expect, it } from 'vitest'
import { compareRecentFirst } from './hwid-device-limit'

describe('compareRecentFirst', () => {
  it('keeps the most recently active devices first', () => {
    const devices = [
      { hwid: 'old', updatedAt: '2026-01-01T00:00:00.000Z' },
      { hwid: 'new', updatedAt: '2026-03-01T00:00:00.000Z' },
      { hwid: 'middle', updatedAt: '2026-02-01T00:00:00.000Z' },
    ]

    expect(devices.sort(compareRecentFirst).map((device) => device.hwid)).toEqual([
      'new',
      'middle',
      'old',
    ])
  })

  it('falls back to creation time and then a stable HWID order', () => {
    const devices = [
      { hwid: 'b', createdAt: '2026-01-01T00:00:00.000Z' },
      { hwid: 'a', createdAt: '2026-01-01T00:00:00.000Z' },
      { hwid: 'new', createdAt: '2026-02-01T00:00:00.000Z' },
    ]

    expect(devices.sort(compareRecentFirst).map((device) => device.hwid)).toEqual(['new', 'a', 'b'])
  })
})
