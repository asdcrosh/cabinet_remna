import Link from 'next/link'
import type { ReactNode } from 'react'
import { Activity, CreditCard, KeyRound, ShieldCheck } from 'lucide-react'
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
    <div className="min-h-dvh bg-slate-50 dark:bg-surface-950 lg:grid lg:grid-cols-[minmax(24rem,0.9fr)_minmax(0,1.1fr)]">
      {enableTelegramMiniApp && <TelegramMiniAppAuth />}
      <aside className="relative hidden h-dvh overflow-hidden bg-slate-950 p-10 text-white lg:sticky lg:top-0 lg:flex lg:flex-col lg:justify-between xl:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(14,165,233,0.2),transparent_32%),radial-gradient(circle_at_88%_78%,rgba(16,185,129,0.14),transparent_34%)]" />
        <div aria-hidden="true" className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full border border-white/[0.05]" />
        <div aria-hidden="true" className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full border border-white/[0.07]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
        <Link href="/" className="relative flex w-fit items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-slate-950 shadow-xl shadow-cyan-500/10">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="font-semibold">{brandName}</div>
            <div className="text-sm text-white/65">VPN без лишней сложности</div>
          </div>
        </Link>
        <div className="relative max-w-xl">
          <div className="mb-5 inline-flex rounded-full border border-white/10 bg-white/[0.07] px-3 py-1 text-sm text-white/75">
            Всё необходимое в одном кабинете
          </div>
          <h2 className="text-4xl font-semibold tracking-tight xl:text-5xl xl:leading-[1.08]">VPN работает. Кабинет помогает.</h2>
          <p className="mt-4 max-w-lg text-base leading-7 text-white/65">
            Оплата, подключение и контроль устройств без длинных инструкций и лишних настроек.
          </p>
          <div className="mt-8 grid gap-2.5">
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

      <main className="flex min-h-dvh items-center justify-center px-4 py-6 sm:px-8 sm:py-10 lg:px-10 xl:px-16">
        <div className="w-full max-w-lg">
          <Link href="/" className="mb-5 flex w-fit items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="font-semibold text-slate-950 dark:text-white">{brandName}</span>
          </Link>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_24px_70px_-45px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none sm:p-6">
            <header className="mb-6">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-200">Личный кабинет</div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">{title}</h1>
              <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
            </header>
            {children}
          </section>

          <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">{footer}</div>
          <nav aria-label="Правовая информация" className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Link href="/offer">Оферта</Link>
            <Link href="/terms">Условия</Link>
            <Link href="/privacy">Конфиденциальность</Link>
            <Link href="/consent">Обработка данных</Link>
            <Link href="/refunds">Возвраты</Link>
            <Link href="/contacts">Контакты</Link>
          </nav>
        </div>
      </main>
    </div>
  )
}

function AuthSignal({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.055] px-3.5 py-3 text-sm">
      <div className="flex items-center gap-2 text-white/70">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/[0.08] text-cyan-200">{icon}</span>
        {label}
      </div>
      <div className="text-right font-medium text-white/90">{value}</div>
    </div>
  )
}
