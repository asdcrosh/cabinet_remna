import { describe, expect, it } from 'vitest'
import { formatDeviceClientName } from './device-client'

describe('formatDeviceClientName', () => {
  it('extracts the application name from common subscription user agents', () => {
    expect(formatDeviceClientName('Happ/2.8.0 (iOS 18.3)')).toBe('Happ')
    expect(formatDeviceClientName('v2rayNG/1.10.5')).toBe('v2rayNG')
    expect(formatDeviceClientName('Clash Verge/2.0.0')).toBe('Clash Verge')
    expect(formatDeviceClientName('happ-ios/3.1.0')).toBe('happ ios')
    expect(formatDeviceClientName('DeskBox (Windows)')).toBe('DeskBox')
  })

  it('recognizes browser user agents and handles absent values', () => {
    expect(formatDeviceClientName('Mozilla/5.0 Chrome/128.0.0.0 Safari/537.36')).toBe('Google Chrome')
    expect(formatDeviceClientName('  ')).toBeNull()
    expect(formatDeviceClientName(null)).toBeNull()
  })
})
