import Link from 'next/link'
import type { ReactNode } from 'react'
import { Activity, ArrowLeft, CreditCard, KeyRound, ShieldCheck } from 'lucide-react'
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
    <div className="min-h-dvh bg-slate-100/70 dark:bg-surface-950 lg:grid lg:grid-cols-[minmax(25rem,0.9fr)_minmax(0,1.1fr)]">
      {enableTelegramMiniApp && <TelegramMiniAppAuth />}
      <aside className="relative m-4 mr-0 hidden h-[calc(100dvh-2rem)] overflow-hidden rounded-3xl border border-white/[0.08] bg-slate-950 p-9 text-white lg:sticky lg:top-4 lg:flex lg:flex-col lg:justify-between xl:p-11">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(8,145,178,0.16),transparent_38%)]" />
        <nav aria-label="Основная навигация" className="relative flex items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-slate-950">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold">{brandName}</div>
              <div className="text-sm text-white/55">Личный кабинет</div>
            </div>
          </Link>
          <Link href="/" className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-medium text-white/75 hover:bg-white/[0.09] hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            На главную
          </Link>
        </nav>
        <div className="relative max-w-xl">
          <div className="mb-5 inline-flex rounded-full border border-cyan-300/15 bg-cyan-300/[0.07] px-3 py-1 text-sm text-cyan-100/80">
            Всё необходимое в одном кабинете
          </div>
          <h2 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">VPN работает. Кабинет помогает.</h2>
          <p className="mt-4 max-w-lg text-base leading-7 text-white/60">
            Оплата, подключение и контроль устройств без длинных инструкций и лишних настроек.
          </p>
          <div className="mt-8 grid gap-2">
            <AuthSignal icon={<KeyRound className="h-4 w-4" />} label="Подключение" value="Ссылка и QR-код" />
            <AuthSignal icon={<Activity className="h-4 w-4" />} label="Статус" value="Трафик и срок подписки" />
            <AuthSignal icon={<CreditCard className="h-4 w-4" />} label="Оплата" value="Быстрое продление" />
          </div>
        </div>
        <div className="relative flex items-center gap-2 text-sm text-white/45">
          <ShieldCheck className="h-4 w-4" />
          Защищённый вход и управление подпиской
        </div>
      </aside>

      <main className="flex min-h-dvh items-center justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:py-10 lg:px-10 xl:px-16">
        <div className="w-full max-w-[32rem]">
          <nav aria-label="Основная навигация" className="mb-5 flex items-center justify-between gap-3 lg:hidden">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <span className="truncate font-semibold text-slate-950 dark:text-white">{brandName}</span>
            </Link>
            <Link href="/" aria-label="Вернуться на главную" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </nav>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_28px_80px_-52px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none sm:p-7">
            <header className="mb-6">
              <div className="inline-flex rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200">Личный кабинет</div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">{title}</h1>
              <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
            </header>
            {children}
          </section>

          <footer className="mt-4 rounded-3xl border border-slate-200/80 bg-white/60 px-4 py-3.5 dark:border-white/[0.07] dark:bg-white/[0.02]">
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

function AuthSignal({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.045] px-3.5 py-3 text-sm">
      <div className="flex items-center gap-2 text-white/65">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-cyan-300/[0.08] text-cyan-200">{icon}</span>
        {label}
      </div>
      <div className="text-right font-medium text-white/85">{value}</div>
    </div>
  )
}
