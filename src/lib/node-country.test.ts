import { describe, expect, it } from 'vitest'
import { countryFlag, countryNameRu, nodeHostRemark, resolveNodeCountryCode } from './node-country'

describe('node country', () => {
  it('detects the country locally from the node IP', () => {
    expect(resolveNodeCountryCode('45.10.164.167', 'AUTO')).toBe('US')
  })

  it('keeps an explicit ISO country override', () => {
    expect(resolveNodeCountryCode('45.10.164.167', 'FI')).toBe('FI')
  })

  it('builds country host labels with flags', () => {
    expect(countryFlag('US')).toBe('🇺🇸')
    expect(countryNameRu('US')).toBe('США')
    expect(nodeHostRemark('US', 'TCP')).toBe('🇺🇸 США')
    expect(nodeHostRemark('US', 'XHTTP')).toBe('🇺🇸 США (Резерв)')
  })
})
