export {}

type TelegramWebAppEvent =
  | 'viewportChanged'
  | 'safeAreaChanged'
  | 'contentSafeAreaChanged'
  | 'fullscreenChanged'
  | 'themeChanged'

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string
        platform?: string
        colorScheme?: 'light' | 'dark'
        isFullscreen?: boolean
        safeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number }
        contentSafeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number }
        isVersionAtLeast?: (version: string) => boolean
        ready?: () => void
        expand?: () => void
        disableVerticalSwipes?: () => void
        requestFullscreen?: () => void
        setHeaderColor?: (color: string) => void
        setBackgroundColor?: (color: string) => void
        setBottomBarColor?: (color: string) => void
        openLink?: (url: string, options?: { try_instant_view?: boolean }) => void
        openInvoice?: (url: string, callback?: (status: string) => void) => void
        viewportHeight?: number
        viewportStableHeight?: number
        BackButton?: {
          isVisible?: boolean
          show: () => void
          hide: () => void
          onClick: (callback: () => void) => void
          offClick: (callback: () => void) => void
        }
        onEvent?: (event: TelegramWebAppEvent, callback: () => void) => void
        offEvent?: (event: TelegramWebAppEvent, callback: () => void) => void
      }
    }
  }
}
