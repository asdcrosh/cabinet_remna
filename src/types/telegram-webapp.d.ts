export {}

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
        openLink?: (url: string, options?: { try_instant_view?: boolean }) => void
        viewportHeight?: number
        viewportStableHeight?: number
        onEvent?: (
          event: 'viewportChanged' | 'safeAreaChanged' | 'contentSafeAreaChanged' | 'fullscreenChanged',
          callback: () => void,
        ) => void
        offEvent?: (
          event: 'viewportChanged' | 'safeAreaChanged' | 'contentSafeAreaChanged' | 'fullscreenChanged',
          callback: () => void,
        ) => void
      }
    }
  }
}
