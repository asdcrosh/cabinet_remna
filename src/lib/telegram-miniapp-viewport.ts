export type TelegramMiniAppViewportApi = {
  platform?: string
  colorScheme?: 'light' | 'dark'
  isFullscreen?: boolean
  safeAreaInset?: TelegramMiniAppInset
  contentSafeAreaInset?: TelegramMiniAppInset
  isVersionAtLeast?: (version: string) => boolean
  ready?: () => void
  expand?: () => void
  disableVerticalSwipes?: () => void
  requestFullscreen?: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  setBottomBarColor?: (color: string) => void
}

export type TelegramColorScheme = 'light' | 'dark'

// Последняя тема Telegram: скрипт theme-init в app/layout.tsx читает её до
// гидратации, чтобы при переходах кабинет не мигал темой телефона.
export const TELEGRAM_COLOR_SCHEME_KEY = 'remnawave-cabinet:telegram-color-scheme'

type ThemeRoot = {
  classList: { toggle: (token: string, force?: boolean) => unknown }
  dataset: { themeSource?: string }
}

type TelegramMiniAppInset = {
  top?: number
  bottom?: number
  left?: number
  right?: number
}

type CssVariableTarget = {
  setProperty: (property: string, value: string) => void
}

const INSET_SIDES = ['top', 'bottom', 'left', 'right'] as const

const MOBILE_PLATFORMS = new Set(['android', 'ios'])

export function markTelegramMiniApp(root: { dataset: { telegramMiniApp?: string } }) {
  root.dataset.telegramMiniApp = 'true'
}

export function syncTelegramMiniAppInsets(
  webApp: TelegramMiniAppViewportApi,
  style: CssVariableTarget,
) {
  syncInset('--tg-safe-area-inset', webApp.safeAreaInset, style)
  syncInset('--tg-content-safe-area-inset', webApp.contentSafeAreaInset, style)
}

function syncInset(prefix: string, inset: TelegramMiniAppInset | undefined, style: CssVariableTarget) {
  if (!inset) return

  for (const side of INSET_SIDES) {
    const value = inset[side]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      style.setProperty(`${prefix}-${side}`, `${value}px`)
    }
  }
}

export function prepareTelegramMiniApp(webApp: TelegramMiniAppViewportApi) {
  webApp.ready?.()
  webApp.expand?.()

  if (webApp.isVersionAtLeast?.('7.7')) {
    webApp.disableVerticalSwipes?.()
  }

  const platform = webApp.platform?.toLowerCase()
  const canRequestMobileFullscreen =
    platform !== undefined &&
    MOBILE_PLATFORMS.has(platform) &&
    webApp.isVersionAtLeast?.('8.0') === true &&
    webApp.isFullscreen !== true

  if (canRequestMobileFullscreen) {
    webApp.requestFullscreen?.()
  }
}

/**
 * Кабинет внутри Telegram следует теме Telegram, а не теме телефона: иначе
 * в тёмном Telegram при светлом телефоне открывается светлый кабинет.
 */
export function applyTelegramColorScheme(root: ThemeRoot, scheme: unknown): TelegramColorScheme | null {
  if (scheme !== 'light' && scheme !== 'dark') return null
  root.dataset.themeSource = 'telegram'
  root.classList.toggle('dark', scheme === 'dark')
  return scheme
}

/** Переводит цвет из getComputedStyle (rgb/rgba) или hex в #rrggbb для Telegram API. */
export function cssColorToHex(value: string | null | undefined): string | null {
  const color = value?.trim().toLowerCase()
  if (!color) return null

  const digits = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)?.[1]
  if (digits) {
    return digits.length === 3 ? `#${digits.split('').map((digit) => digit + digit).join('')}` : `#${digits}`
  }

  const rgb = color.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/)
  if (!rgb) return null
  const alpha = rgb[4]
  if (alpha !== undefined && (alpha.endsWith('%') ? Number.parseFloat(alpha) / 100 : Number(alpha)) < 1) return null

  const channels = rgb.slice(1, 4).map(Number)
  if (channels.some((channel) => channel > 255)) return null
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Красит шапку, фон под страницей и нижнюю панель Telegram в фон кабинета,
 * чтобы при оттягивании страницы и в обычном (не полноэкранном) режиме
 * не было полос другого цвета. Старые клиенты пропускаем без ошибок.
 */
export function syncTelegramMiniAppColors(webApp: TelegramMiniAppViewportApi, color: string | null) {
  if (!color) return
  const supports = (version: string) => webApp.isVersionAtLeast?.(version) === true
  const calls: Array<[string, (() => void) | undefined]> = [
    ['6.9', webApp.setHeaderColor && (() => webApp.setHeaderColor?.(color))],
    ['6.1', webApp.setBackgroundColor && (() => webApp.setBackgroundColor?.(color))],
    ['7.10', webApp.setBottomBarColor && (() => webApp.setBottomBarColor?.(color))],
  ]
  for (const [version, call] of calls) {
    if (!call || !supports(version)) continue
    try {
      call()
    } catch {
      // Клиент сообщил о поддержке, но отказал: оставляем его цвета.
    }
  }
}
