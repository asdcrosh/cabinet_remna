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
    <div className="min-h-dvh bg-[#f4f5f1] dark:bg-[#0a0c0d] lg:grid lg:grid-cols-[minmax(25rem,0.9fr)_minmax(0,1.1fr)]">
      {enableTelegramMiniApp && <TelegramMiniAppAuth />}
      <aside className="relative hidden h-dvh overflow-hidden border-r border-white/[0.1] bg-[#0d1417] p-9 text-white lg:sticky lg:top-0 lg:flex lg:flex-col lg:justify-between xl:p-11">
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-cyan-400" />
        <nav aria-label="Основная навигация" className="relative flex items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/20 bg-white text-slate-950">
              <ShieldCheck className="h-6 w-6" />
            </div>
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
        <div className="relative max-w-xl">
          <div className="mb-5 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">
            <span className="h-px w-8 bg-cyan-300" />
            Управление VPN
          </div>
          <h2 className="max-w-lg text-4xl font-semibold leading-[1.06] tracking-[-0.035em] xl:text-5xl">Подписка под контролем.</h2>
          <p className="mt-4 max-w-lg text-base leading-7 text-white/60">
            Срок, трафик, ключи устройств и продление собраны в одном рабочем экране.
          </p>
          <div className="mt-9 border-y border-white/15">
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
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <span className="truncate font-semibold text-slate-950 dark:text-white">{brandName}</span>
            </Link>
            <Link href="/" aria-label="Вернуться на главную" className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-300 bg-white text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </nav>

          <section className="rounded-xl border border-slate-300/80 border-t-[3px] border-t-cyan-600 bg-white p-5 dark:border-white/10 dark:border-t-cyan-300 dark:bg-white/[0.03] sm:p-7">
            <header className="mb-6">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Личный кабинет / Вход</div>
              <h1 className="mt-2.5 text-2xl font-semibold tracking-[-0.02em] text-slate-950 dark:text-white sm:text-3xl">{title}</h1>
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

function AuthSignal({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 px-0 py-3.5 text-sm last:border-b-0">
      <div className="flex items-center gap-2 text-white/65">
        <span className="grid h-7 w-7 place-items-center border border-white/15 text-cyan-200">{icon}</span>
        {label}
      </div>
      <div className="text-right font-medium text-white/85">{value}</div>
    </div>
  )
}
