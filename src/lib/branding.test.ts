import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_ACCENT_SECONDARY_COLOR,
  brandCssVariables,
  normalizeBrandSettings,
} from './branding'

describe('branding settings', () => {
  it('keeps supported uploaded logos and valid colors', () => {
    const settings = normalizeBrandSettings({
      logoUrl: '/uploads/branding/logo.webp',
      accentColor: '#FF00AA',
      accentSecondaryColor: '#1122CC',
    })

    expect(settings).toEqual({
      logoUrl: '/uploads/branding/logo.webp',
      accentColor: '#ff00aa',
      accentSecondaryColor: '#1122cc',
    })
    expect(brandCssVariables(settings)).toMatchObject({
      '--app-accent': '#ff00aa',
      '--app-ink': '#1122cc',
    })
  })

  it('falls back to the standard mark and safe palette for invalid values', () => {
    expect(normalizeBrandSettings({
      logoUrl: '/unknown/logo.svg',
      accentColor: 'pink',
      accentSecondaryColor: '#123',
    })).toEqual({
      logoUrl: null,
      accentColor: DEFAULT_ACCENT_COLOR,
      accentSecondaryColor: DEFAULT_ACCENT_SECONDARY_COLOR,
    })
  })
})
