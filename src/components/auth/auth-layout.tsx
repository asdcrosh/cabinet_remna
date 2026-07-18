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
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_0.95fr]">
      {enableTelegramMiniApp && <TelegramMiniAppAuth />}
      <div className="relative hidden overflow-hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(14,165,233,0.22),transparent_42%),linear-gradient(225deg,rgba(16,185,129,0.18),transparent_36%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
        <Link href="/" className="flex items-center gap-3">
          <div className="relative grid h-11 w-11 place-items-center rounded-xl bg-white text-slate-950 shadow-xl shadow-cyan-500/10">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="relative">
            <div className="font-semibold">{brandName}</div>
            <div className="text-sm text-white/65">VPN без лишней сложности</div>
          </div>
        </Link>
        <div className="relative max-w-lg">
          <div className="mb-6 inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm text-white/80 backdrop-blur">
            Подписка, платежи и подключение в одном месте
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">Личный кабинет, который не мешает пользоваться VPN.</h1>
          <p className="mt-4 text-white/70">
            Следите за подпиской, продлевайте тариф и подключайте устройства без лишних действий.
          </p>
          <div className="mt-8 grid gap-3">
            <AuthSignal icon={<KeyRound className="h-4 w-4" />} label="Подключение" value="Ссылка и QR-код" />
            <AuthSignal icon={<Activity className="h-4 w-4" />} label="Статус" value="Трафик и срок подписки" />
            <AuthSignal icon={<CreditCard className="h-4 w-4" />} label="Оплата" value="Онлайн и без ожидания" />
          </div>
        </div>
        <div className="relative text-sm text-white/50">Защищённый вход, оплата и подписка в одном месте.</div>
      </div>

      <div className="flex items-center justify-center px-4 py-6 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 lg:hidden">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <div className="card">{children}</div>
          <div className="mt-4 text-center text-sm text-slate-500">{footer}</div>
          <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <Link href="/terms">Условия</Link>
            <Link href="/privacy">Конфиденциальность</Link>
            <Link href="/consent">Обработка данных</Link>
            <Link href="/refunds">Возвраты</Link>
            <Link href="/contacts">Контакты</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function AuthSignal({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm backdrop-blur">
      <div className="flex items-center gap-2 text-white/70">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-cyan-200">{icon}</span>
        {label}
      </div>
      <div className="text-right text-white/90">{value}</div>
    </div>
  )
}
