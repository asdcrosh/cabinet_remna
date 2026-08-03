export type TelegramMiniAppViewportApi = {
  platform?: string
  colorScheme?: 'light' | 'dark'
  isFullscreen?: boolean
  isVersionAtLeast?: (version: string) => boolean
  ready?: () => void
  expand?: () => void
  disableVerticalSwipes?: () => void
  requestFullscreen?: () => void
  setHeaderColor?: (color: string) => void
}

const MOBILE_PLATFORMS = new Set(['android', 'ios'])

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
