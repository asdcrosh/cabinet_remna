import { describe, expect, it } from 'vitest'
import { normalizeUsageSeries } from './traffic-usage'

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
})
