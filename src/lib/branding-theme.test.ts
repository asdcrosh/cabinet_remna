import { describe, expect, it } from 'vitest'
import { BRAND_THEME_PRESETS, contrastRatio, getBrandThemePreview } from './branding-theme'

describe('brand theme presets', () => {
  it('keeps accent text readable in light and dark modes', () => {
    for (const preset of BRAND_THEME_PRESETS) {
      for (const mode of ['light', 'dark'] as const) {
        const theme = getBrandThemePreview(preset.accentColor, preset.accentSecondaryColor, mode)

        expect(contrastRatio(theme.accentText, theme.surface), `${preset.id} ${mode} primary`).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(theme.secondaryText, theme.surface), `${preset.id} ${mode} secondary`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('uses a readable label on every solid preset color', () => {
    for (const preset of BRAND_THEME_PRESETS) {
      for (const mode of ['light', 'dark'] as const) {
        const theme = getBrandThemePreview(preset.accentColor, preset.accentSecondaryColor, mode)

        expect(contrastRatio(theme.accentOn, theme.accent), `${preset.id} primary`).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(theme.secondaryOn, theme.secondary), `${preset.id} secondary`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
