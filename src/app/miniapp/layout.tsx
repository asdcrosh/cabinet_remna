import { Manrope } from 'next/font/google'

// Фирменный шрифт Mini App: чёткая кириллица, табличные цифры, веса 200–800.
const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-manrope',
  display: 'swap',
})

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return <div className={manrope.variable} style={{ display: 'contents' }}>{children}</div>
}
