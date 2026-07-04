export {}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string
        ready?: () => void
        expand?: () => void
        openLink?: (url: string, options?: { try_instant_view?: boolean }) => void
        viewportHeight?: number
        viewportStableHeight?: number
        onEvent?: (event: 'viewportChanged', callback: () => void) => void
        offEvent?: (event: 'viewportChanged', callback: () => void) => void
      }
    }
  }
}
