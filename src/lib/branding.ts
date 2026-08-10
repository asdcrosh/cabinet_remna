import type { CSSProperties } from 'react'
import { prisma } from './prisma'

const DEFAULT_BRAND_NAME = 'VPN Cabinet'
export const DEFAULT_ACCENT_COLOR = '#d832d4'
export const DEFAULT_ACCENT_SECONDARY_COLOR = '#5424bc'

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
  return {
    '--app-accent': settings.accentColor,
    '--app-accent-hover': mixHex(settings.accentColor, '#000000', 0.18),
    '--app-accent-soft': `color-mix(in srgb, ${settings.accentColor} 15%, transparent)`,
    '--app-ink': settings.accentSecondaryColor,
    '--app-ink-hover': mixHex(settings.accentSecondaryColor, '#ffffff', 0.14),
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

function mixHex(first: string, second: string, ratio: number) {
  const a = hexChannels(first)
  const b = hexChannels(second)
  const channels = a.map((value, index) => Math.round(value * (1 - ratio) + b[index]! * ratio))
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function hexChannels(value: string) {
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16))
}
