import './globals.css'
import './design-system.css'
import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/toaster'
import { brandCssVariables, getBrandName, getPublicBrandSettings } from '@/lib/branding'
import Script from 'next/script'
import { TelegramMiniAppViewport } from '@/components/telegram/telegram-miniapp-viewport'
import { TelegramMiniAppScript } from '@/components/telegram/telegram-miniapp-script'
import { BrandingProvider } from '@/components/branding-provider'

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
  themeColor: '#090718',
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
              const media = window.matchMedia('(prefers-color-scheme: dark)')
              const apply = () => document.documentElement.classList.toggle('dark', media.matches)
              apply()
              media.addEventListener?.('change', apply)
            } catch {}
          })()`}
        </Script>
        <TelegramMiniAppScript />
        <TelegramMiniAppViewport />
        <BrandingProvider settings={branding}>{children}</BrandingProvider>
        <Toaster />
      </body>
    </html>
  )
}
