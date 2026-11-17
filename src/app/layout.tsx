import './globals.css'
import './design-system.css'
import './bonus-roulette.css'
import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/toaster'
import { brandCssVariables, getBrandName, getPublicBrandSettings } from '@/lib/branding'
import Script from 'next/script'
import { TelegramMiniAppViewport } from '@/components/telegram/telegram-miniapp-viewport'
import { TelegramMiniAppScript } from '@/components/telegram/telegram-miniapp-script'
import { BrandingProvider } from '@/components/branding-provider'
import { SessionExpiredBanner } from '@/components/auth/session-expired-banner'
import { TELEGRAM_COLOR_SCHEME_KEY } from '@/lib/telegram-miniapp-viewport'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getPublicBrandSettings()
  const icon = branding.logoUrl || '/icon.svg'
  return {
    title: {
      default: getBrandName(),
      template: `%s — ${getBrandName()}`,
    },
    description: `${getBrandName()}: VPN-подписка, подключение и оплата`,
    icons: { icon, apple: icon },
  }
}

export const viewport: Viewport = {
  // Совпадает с --app-bg светлой и тёмной темы в design-system.css.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f6fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0a14' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await getPublicBrandSettings()
  return (
    <html lang="ru" suppressHydrationWarning style={brandCssVariables(branding)}>
      <body className="font-sans">
        <Script id="theme-init" strategy="beforeInteractive">
          {`(() => {
            try {
              const root = document.documentElement
              const media = window.matchMedia('(prefers-color-scheme: dark)')
              const telegramScheme = () => {
                try { return window.sessionStorage.getItem('${TELEGRAM_COLOR_SCHEME_KEY}') } catch { return null }
              }
              const apply = () => {
                if (root.dataset.themeSource === 'telegram') return
                const scheme = telegramScheme()
                root.classList.toggle('dark', scheme === 'dark' || (scheme !== 'light' && media.matches))
              }
              apply()
              media.addEventListener?.('change', apply)
            } catch {}
          })()`}
        </Script>
        <TelegramMiniAppScript />
        <TelegramMiniAppViewport />
        <BrandingProvider settings={branding}>{children}</BrandingProvider>
        <SessionExpiredBanner />
        <Toaster />
      </body>
    </html>
  )
}
