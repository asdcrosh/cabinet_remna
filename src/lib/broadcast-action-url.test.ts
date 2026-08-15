import { describe, expect, it } from 'vitest'
import {
  getBroadcastActionUrl,
  isExternalBroadcastActionHref,
  normalizeBroadcastActionHref,
} from './broadcast-action-url'

const appUrl = 'https://cabinet.example.test'

describe('broadcast action urls', () => {
  it('keeps cabinet links relative', () => {
    expect(normalizeBroadcastActionHref('/dashboard/plans?promo=HELLO', appUrl)).toBe('/dashboard/plans?promo=HELLO')
    expect(normalizeBroadcastActionHref('https://cabinet.example.test/dashboard/plans?promo=HELLO', appUrl)).toBe('/dashboard/plans?promo=HELLO')
  })

  it('accepts an external HTTPS link for a broadcast', () => {
    const href = normalizeBroadcastActionHref('https://example.org/offer?from=mailing', appUrl)

    expect(href).toBe('https://example.org/offer?from=mailing')
    expect(isExternalBroadcastActionHref(href)).toBe(true)
    expect(getBroadcastActionUrl(href, appUrl)).toBe('https://example.org/offer?from=mailing')
  })

  it('rejects unsafe or unsupported action links', () => {
    expect(normalizeBroadcastActionHref('http://example.org', appUrl)).toBeNull()
    expect(normalizeBroadcastActionHref('javascript:alert(1)', appUrl)).toBeNull()
    expect(normalizeBroadcastActionHref('/register', appUrl)).toBeNull()
  })
})
