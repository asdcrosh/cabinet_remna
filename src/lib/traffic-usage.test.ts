import { describe, expect, it } from 'vitest'
import { hasTrafficUsage, normalizeUsageSeries } from './traffic-usage'

describe('normalizeUsageSeries', () => {
  it('normalizes direct byte rows and nested response formats', () => {
    expect(normalizeUsageSeries({
      records: [
        { date: '2026-06-23', bytes: '1024' },
        { date: '2026-06-24', totalBytes: 2048 },
      ],
    })).toEqual([
      { date: '2026-06-23', bytes: '1024' },
      { date: '2026-06-24', bytes: '2048' },
    ])
  })

  it('combines upload and download and groups the same day', () => {
    expect(normalizeUsageSeries([
      { timestamp: '2026-06-24T10:00:00Z', uploadBytes: '100', downloadBytes: '300' },
      { timestamp: '2026-06-24T11:00:00Z', upload_bytes: 50, download_bytes: 50 },
    ])).toEqual([{ date: '2026-06-24', bytes: '500' }])
  })

  it('unwraps the Remnawave response and fills missing days with zero usage', () => {
    expect(normalizeUsageSeries({
      response: [
        { date: '2026-06-22', bytes: '1024' },
        { date: '2026-06-24', bytes: '2048' },
      ],
    }, {
      start: new Date('2026-06-22T12:00:00Z'),
      end: new Date('2026-06-24T12:00:00Z'),
    })).toEqual([
      { date: '2026-06-22', bytes: '1024' },
      { date: '2026-06-23', bytes: '0' },
      { date: '2026-06-24', bytes: '2048' },
    ])
  })

  it('normalizes the current Remnawave bandwidth stats response', () => {
    expect(normalizeUsageSeries({
      response: {
        categories: ['2026-06-22', '2026-06-23', '2026-06-24'],
        sparklineData: [1024, 0, 2048],
        series: [],
      },
    })).toEqual([
      { date: '2026-06-22', bytes: '1024' },
      { date: '2026-06-23', bytes: '0' },
      { date: '2026-06-24', bytes: '2048' },
    ])
  })

  it('does not treat an all-zero range as used traffic', () => {
    expect(hasTrafficUsage([
      { date: '2026-06-23', bytes: '0' },
      { date: '2026-06-24', bytes: '0' },
    ])).toBe(false)
    expect(hasTrafficUsage([
      { date: '2026-06-23', bytes: '0' },
      { date: '2026-06-24', bytes: '1' },
    ])).toBe(true)
  })
})
