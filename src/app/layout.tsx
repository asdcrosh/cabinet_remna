import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/toaster'
import { getBrandName } from '@/lib/branding'
import Script from 'next/script'

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
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="font-sans">
        <Script src="https://telegram.org/js/telegram-web-app.js?62" strategy="beforeInteractive" />
        {children}
        <Toaster />
      </body>
    </html>
  )
}
