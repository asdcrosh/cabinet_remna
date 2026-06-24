import { describe, expect, it } from 'vitest'
import { readRemnawaveBigInt } from './remnawave-usage'

describe('readRemnawaveBigInt', () => {
  it('accepts both user and subscription traffic field names', () => {
    expect(readRemnawaveBigInt({ usedTrafficBytes: '1024' }, ['usedTrafficBytes', 'trafficUsedBytes'])).toBe(1024n)
    expect(readRemnawaveBigInt({ trafficUsedBytes: '2048' }, ['usedTrafficBytes', 'trafficUsedBytes'])).toBe(2048n)
  })

  it('returns zero for missing or formatted values', () => {
    expect(readRemnawaveBigInt({}, ['trafficUsedBytes'])).toBe(0n)
    expect(readRemnawaveBigInt({ trafficUsed: '2 GB' }, ['trafficUsed'])).toBe(0n)
  })
})
