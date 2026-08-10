import type { CSSProperties } from 'react'
import { prisma } from './prisma'
import { DEFAULT_BRAND_THEME, getBrandThemePreview, mixHex } from './branding-theme'

const DEFAULT_BRAND_NAME = 'VPN Cabinet'
export const DEFAULT_ACCENT_COLOR = DEFAULT_BRAND_THEME.accentColor
export const DEFAULT_ACCENT_SECONDARY_COLOR = DEFAULT_BRAND_THEME.accentSecondaryColor

export type PublicBrandSettings = {
  logoUrl: string | null
  accentColor: string
  accentSecondaryColor: string
}

export function getBrandName() {
  const value = process.env.CABINET_BRAND_NAME?.trim()
  return value || DEFAULT_BRAND_NAME
}

export function getPageTitle(title: string) {
  return `${title} — ${getBrandName()}`
}

export async function getPublicBrandSettings(): Promise<PublicBrandSettings> {
  const setting = await prisma.brandSetting.findUnique({
    where: { id: 'default' },
    select: { logoUrl: true, accentColor: true, accentSecondaryColor: true },
  }).catch(() => null)

  return normalizeBrandSettings(setting ?? {
    logoUrl: process.env.CABINET_LOGO_URL?.trim() || null,
    accentColor: DEFAULT_ACCENT_COLOR,
    accentSecondaryColor: DEFAULT_ACCENT_SECONDARY_COLOR,
  })
}

export async function updateBrandSettings(input: PublicBrandSettings) {
  const settings = normalizeBrandSettings(input)
  return prisma.brandSetting.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...settings },
    update: settings,
    select: { logoUrl: true, accentColor: true, accentSecondaryColor: true },
  })
}

export function normalizeBrandSettings(input: PublicBrandSettings): PublicBrandSettings {
  return {
    logoUrl: normalizeLogoUrl(input.logoUrl),
    accentColor: normalizeHexColor(input.accentColor, DEFAULT_ACCENT_COLOR),
    accentSecondaryColor: normalizeHexColor(input.accentSecondaryColor, DEFAULT_ACCENT_SECONDARY_COLOR),
  }
}

export function brandCssVariables(settings: PublicBrandSettings): CSSProperties {
  const light = getBrandThemePreview(settings.accentColor, settings.accentSecondaryColor, 'light')
  const dark = getBrandThemePreview(settings.accentColor, settings.accentSecondaryColor, 'dark')

  return {
    '--brand-primary': settings.accentColor,
    '--brand-secondary': settings.accentSecondaryColor,
    '--brand-light-primary-text': light.accentText,
    '--brand-dark-primary-text': dark.accentText,
    '--brand-light-secondary-text': light.secondaryText,
    '--brand-dark-secondary-text': dark.secondaryText,
    '--brand-primary-on': light.accentOn,
    '--brand-secondary-on': light.secondaryOn,
    '--brand-gradient-on': light.gradientOn,
    '--brand-primary-hover-light': mixHex(settings.accentColor, '#000000', 0.18),
    '--brand-primary-hover-dark': mixHex(settings.accentColor, '#ffffff', 0.16),
    '--brand-secondary-hover-light': mixHex(settings.accentSecondaryColor, '#000000', 0.12),
    '--brand-secondary-hover-dark': mixHex(settings.accentSecondaryColor, '#ffffff', 0.14),
  } as CSSProperties
}

function normalizeLogoUrl(value: string | null) {
  const normalized = value?.trim() || null
  if (!normalized) return null
  if (normalized.startsWith('/uploads/branding/')) return normalized
  if (/^https:\/\//i.test(normalized)) return normalized
  return null
}

function normalizeHexColor(value: string, fallback: string) {
  const normalized = value.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback
}
