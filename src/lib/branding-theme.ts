export type BrandThemePreset = {
  id: string
  name: string
  description: string
  accentColor: string
  accentSecondaryColor: string
}

export type BrandThemeMode = 'light' | 'dark'

export const BRAND_THEME_PRESETS: BrandThemePreset[] = [
  {
    id: 'signature',
    name: 'Фирменная',
    description: 'Предыдущий стиль: неоновый розовый и глубокий фиолетовый',
    accentColor: '#d832d4',
    accentSecondaryColor: '#5424bc',
  },
  {
    id: 'ultraviolet',
    name: 'Ультрафиолет',
    description: 'Спокойнее фирменной, с холодным фиолетовым акцентом',
    accentColor: '#8b5cf6',
    accentSecondaryColor: '#4338ca',
  },
  {
    id: 'ocean',
    name: 'Океан',
    description: 'Чистая сине-бирюзовая палитра для строгого интерфейса',
    accentColor: '#0891b2',
    accentSecondaryColor: '#1d4ed8',
  },
  {
    id: 'emerald',
    name: 'Изумруд',
    description: 'Сдержанный зелёный с тёмным хвойным основанием',
    accentColor: '#059669',
    accentSecondaryColor: '#0f766e',
  },
  {
    id: 'sunset',
    name: 'Закат',
    description: 'Тёплый коралловый акцент с насыщенным винным цветом',
    accentColor: '#e11d48',
    accentSecondaryColor: '#7e22ce',
  },
]

export const DEFAULT_BRAND_THEME = BRAND_THEME_PRESETS[0]!

const MODE_COLORS = {
  light: {
    background: '#f7f5ff',
    surface: '#fefcff',
    surfaceSoft: '#efebfa',
    text: '#201536',
    muted: '#716983',
    border: '#ddd7ec',
  },
  dark: {
    background: '#080716',
    surface: '#110d24',
    surfaceSoft: '#1a1433',
    text: '#f9f5ff',
    muted: '#aaa1bb',
    border: '#312a49',
  },
} as const

export function getBrandThemePreview(accentColor: string, accentSecondaryColor: string, mode: BrandThemeMode) {
  const colors = MODE_COLORS[mode]
  const toward = mode === 'light' ? '#000000' : '#ffffff'
  const accentText = ensureContrast(accentColor, colors.surface, 4.5, toward)
  const secondaryText = ensureContrast(accentSecondaryColor, colors.surface, 4.5, toward)

  return {
    ...colors,
    accent: accentColor,
    accentText,
    accentOn: bestTextColor(accentColor),
    secondary: accentSecondaryColor,
    secondaryText,
    secondaryOn: bestTextColor(accentSecondaryColor),
    gradientOn: bestGradientTextColor(accentColor, accentSecondaryColor),
  }
}

export function ensureContrast(foreground: string, background: string, minimum: number, toward: '#000000' | '#ffffff') {
  if (contrastRatio(foreground, background) >= minimum) return foreground.toLowerCase()

  for (let step = 1; step <= 20; step += 1) {
    const candidate = mixHex(foreground, toward, step / 20)
    if (contrastRatio(candidate, background) >= minimum) return candidate
  }

  return toward
}

export function contrastRatio(first: string, second: string) {
  const light = Math.max(relativeLuminance(first), relativeLuminance(second))
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (light + 0.05) / (dark + 0.05)
}

export function mixHex(first: string, second: string, ratio: number) {
  const a = hexChannels(first)
  const b = hexChannels(second)
  const channels = a.map((value, index) => Math.round(value * (1 - ratio) + b[index]! * ratio))
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function bestTextColor(background: string) {
  return contrastRatio('#ffffff', background) >= contrastRatio('#000000', background) ? '#ffffff' : '#000000'
}

function bestGradientTextColor(first: string, second: string) {
  const whiteContrast = Math.min(contrastRatio('#ffffff', first), contrastRatio('#ffffff', second))
  const darkContrast = Math.min(contrastRatio('#000000', first), contrastRatio('#000000', second))
  return whiteContrast >= darkContrast ? '#ffffff' : '#000000'
}

function relativeLuminance(value: string) {
  const channels = hexChannels(value).map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}

function hexChannels(value: string) {
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16))
}
