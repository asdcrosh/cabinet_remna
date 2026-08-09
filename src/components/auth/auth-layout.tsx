import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { getBrandName } from '@/lib/branding'
import { TelegramMiniAppAuth } from './telegram-miniapp-auth'

interface AuthLayoutProps {
  title: string
  description: string
  footer: ReactNode
  children: ReactNode
  enableTelegramMiniApp?: boolean
}

export function AuthLayout({
  title,
  description,
  footer,
  children,
  enableTelegramMiniApp = false,
}: AuthLayoutProps) {
  const brandName = getBrandName()

  return (
    <div className="auth-shell min-h-dvh lg:grid lg:grid-cols-[minmax(21rem,0.68fr)_minmax(0,1.32fr)]">
      {enableTelegramMiniApp && <TelegramMiniAppAuth />}
      <aside className="auth-aside relative hidden h-dvh overflow-hidden border-r p-8 text-white lg:sticky lg:top-0 lg:flex lg:flex-col lg:justify-between xl:p-10">
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-brand-300" />
        <nav aria-label="Основная навигация" className="relative flex items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-11 w-11" priority />
            <div className="min-w-0">
              <div className="truncate font-semibold">{brandName}</div>
              <div className="text-sm text-white/55">Личный кабинет</div>
            </div>
          </Link>
          <Link href="/" className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-white/15 px-3 text-sm font-medium text-white/70 hover:border-white/30 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            На главную
          </Link>
        </nav>
        <div className="relative max-w-md">
          <div className="mb-5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-200">Private access / 01</div>
          <h2 className="text-3xl font-semibold leading-[1.05] tracking-[-0.04em] xl:text-[2.7rem]">Подключение без лишних экранов.</h2>
          <p className="mt-4 text-base leading-7 text-white/60">
            Войдите, чтобы увидеть статус подписки и следующий нужный шаг.
          </p>
        </div>
        <div className="relative flex items-center gap-2 text-sm text-white/45">
          <ShieldCheck className="h-4 w-4" />
          Защищённый вход и управление подпиской
        </div>
      </aside>

      <main className="flex min-h-dvh items-start justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom),var(--tg-content-safe-area-inset-bottom,0px),var(--telegram-miniapp-bottom-offset,0px))] pt-[max(1rem,env(safe-area-inset-top),calc(var(--tg-content-safe-area-inset-top,0px)+var(--telegram-miniapp-top-offset,0px)))] sm:px-8 sm:py-10 lg:items-center lg:px-10 xl:px-16">
        <div className="w-full max-w-[32rem]">
          <nav aria-label="Основная навигация" className="mb-5 flex items-center justify-between gap-3 lg:hidden">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <BrandLogo className="h-10 w-10" priority />
              <span className="truncate font-semibold text-slate-950 dark:text-white">{brandName}</span>
            </Link>
            <Link href="/" aria-label="Вернуться на главную" className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-300 bg-white text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </nav>

          <section className="auth-panel border p-5 sm:p-7">
            <header className="mb-6">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-950 dark:text-white sm:text-3xl">{title}</h1>
              <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
            </header>
            {children}
          </section>

          <footer className="mt-5 border-t border-slate-300/80 px-1 pt-4 dark:border-white/[0.1]">
            <div className="text-center text-sm text-slate-600 dark:text-slate-400">{footer}</div>
            <nav aria-label="Правовая информация" className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-2 border-t border-slate-200/80 pt-3 text-xs text-slate-400 dark:border-white/[0.07] dark:text-slate-500">
              <Link href="/offer" className="hover:text-slate-700 dark:hover:text-slate-300">Оферта</Link>
              <Link href="/terms" className="hover:text-slate-700 dark:hover:text-slate-300">Условия</Link>
              <Link href="/privacy" className="hover:text-slate-700 dark:hover:text-slate-300">Конфиденциальность</Link>
              <Link href="/consent" className="hover:text-slate-700 dark:hover:text-slate-300">Обработка данных</Link>
              <Link href="/refunds" className="hover:text-slate-700 dark:hover:text-slate-300">Возвраты</Link>
              <Link href="/contacts" className="hover:text-slate-700 dark:hover:text-slate-300">Контакты</Link>
            </nav>
          </footer>
        </div>
      </main>
    </div>
  )
}
