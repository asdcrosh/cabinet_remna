import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/toaster'
import { getBrandName } from '@/lib/branding'
import Script from 'next/script'
import { TelegramMiniAppViewport } from '@/components/telegram/telegram-miniapp-viewport'

export const metadata: Metadata = {
  title: {
    default: getBrandName(),
    template: `%s — ${getBrandName()}`,
  },
  description: `${getBrandName()}: VPN-подписка, подключение и оплата`,
  icons: {
    icon: '/icon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#080b10',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="font-sans">
        <Script id="theme-init" strategy="beforeInteractive">
          {`(() => {
            try {
              const media = window.matchMedia('(prefers-color-scheme: dark)')
              const apply = () => document.documentElement.classList.toggle('dark', media.matches)
              apply()
              media.addEventListener?.('change', apply)
            } catch {}
          })()`}
        </Script>
        <Script src="https://telegram.org/js/telegram-web-app.js?62" strategy="beforeInteractive" />
        <TelegramMiniAppViewport />
        {children}
        <Toaster />
      </body>
    </html>
  )
}
