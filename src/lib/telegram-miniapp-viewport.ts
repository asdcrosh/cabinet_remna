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
    webApp.setHeaderColor?.(webApp.colorScheme === 'dark' ? '#0a0c0d' : '#f4f5f1')
    webApp.requestFullscreen?.()
  }
}
