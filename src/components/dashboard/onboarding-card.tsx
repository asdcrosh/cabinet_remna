import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  ArrowRight,
  KeyRound,
  MailCheck,
  QrCode,
  Send,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react'
import { cn } from '@/lib/cn'

export interface DashboardOnboardingState {
  emailVerified: boolean
  telegramLinked: boolean
  remnashopSynced: boolean
  hasLocalSubscription: boolean
  hasRemnawaveProfile: boolean
  pendingSync: boolean
  deviceCount: number
}

interface DashboardOnboardingCardProps {
  state: DashboardOnboardingState
  mode?: 'full' | 'compact'
  supportEnabled?: boolean
}

interface NextAction {
  title: string
  description: string
  href: string
  label: string
  icon: ReactNode
  tone: 'cyan' | 'emerald' | 'amber' | 'slate'
}

export function DashboardOnboardingCard({ state, mode = 'compact', supportEnabled = true }: DashboardOnboardingCardProps) {
  const action = getNextAction(state)
  const isFull = mode === 'full'

  if (!action && !isFull) return null

  if (!isFull && action) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/[0.025] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', toneClass(action.tone))}>
            {action.icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-cyan-700 dark:text-cyan-200">Следующий шаг</p>
            <h2 className="mt-1 text-lg font-semibold leading-tight tracking-tight text-slate-950 dark:text-white">{action.title}</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{action.description}</p>
          </div>
        </div>
        <Link href={action.href} className="btn-primary mt-4 min-h-11 w-full justify-between rounded-2xl px-4 sm:w-auto sm:justify-center">
          {action.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    )
  }

  return (
    <section className="subscription-ticket p-5 sm:p-7">
      <div className="max-w-2xl">
          <div className="flex items-start gap-3">
            <div className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl', toneClass(action?.tone ?? 'emerald'))}>
              {action?.icon ?? <ShieldCheck className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-cyan-700 dark:text-cyan-200">
                {action ? 'Начните отсюда' : 'Всё готово'}
              </p>
              <h2 className="mt-1 text-xl font-semibold leading-tight tracking-tight text-slate-950 dark:text-white sm:text-2xl">
                {action?.title ?? 'Кабинет настроен'}
              </h2>
            </div>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            {action?.description ?? 'Можно смотреть подписку, устройства, платежи и бонусы.'}
          </p>
          <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            {action ? (
              <Link href={action.href} className="btn-primary min-h-11 w-full justify-between px-4 sm:w-auto sm:justify-center">
                {action.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link href="/dashboard/subscription" className="btn-primary min-h-11 w-full justify-between px-4 sm:w-auto sm:justify-center">
                Открыть подписку
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {supportEnabled && (
              <Link href="/dashboard/support" className="inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-cyan-700 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-cyan-200">
                Нужна помощь?
              </Link>
            )}
          </div>
      </div>
    </section>
  )
}

function getNextAction(state: DashboardOnboardingState): NextAction | null {
  if (state.pendingSync && !state.hasRemnawaveProfile) {
    return {
      title: 'Проверить подписку',
      description: 'Оплата есть, но профиль доступа еще не появился. Откройте подписку и обновите статус.',
      href: '/dashboard/subscription',
      label: 'Проверить',
      icon: <KeyRound className="h-5 w-5" />,
      tone: 'amber',
    }
  }

  if (!state.hasLocalSubscription && !state.hasRemnawaveProfile) {
    return {
      title: 'Выберите тариф',
      description: 'После покупки в кабинете появятся QR-код и ссылка подписки.',
      href: '/dashboard/plans',
      label: 'К тарифам',
      icon: <ShoppingBag className="h-5 w-5" />,
      tone: 'cyan',
    }
  }

  if (state.hasRemnawaveProfile && state.deviceCount === 0) {
    return {
      title: 'Подключите устройство',
      description: 'Откройте подписку и добавьте ее в приложение по QR-коду или ссылке.',
      href: '/dashboard/subscription',
      label: 'Подключить',
      icon: <QrCode className="h-5 w-5" />,
      tone: 'emerald',
    }
  }

  if (!state.emailVerified) {
    return {
      title: 'Добавьте email',
      description: 'Email поможет восстановить доступ и объединять покупки между кабинетом и Telegram.',
      href: '/dashboard/settings',
      label: 'Добавить email',
      icon: <MailCheck className="h-5 w-5" />,
      tone: 'slate',
    }
  }

  if (!state.telegramLinked) {
    return {
      title: 'Привяжите Telegram',
      description: 'Так кабинет сможет найти старую подписку и синхронизировать данные из Remnashop.',
      href: '/dashboard/settings',
      label: 'Привязать',
      icon: <Send className="h-5 w-5" />,
      tone: 'slate',
    }
  }

  if (state.telegramLinked && !state.remnashopSynced) {
    return {
      title: 'Проверить Telegram',
      description: 'Запустите синхронизацию, чтобы кабинет обновил данные Remnashop и Remnawave.',
      href: '/dashboard/settings',
      label: 'Проверить',
      icon: <Send className="h-5 w-5" />,
      tone: 'amber',
    }
  }

  return null
}

function toneClass(tone: NextAction['tone']) {
  switch (tone) {
    case 'cyan':
      return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200'
    case 'emerald':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
    case 'amber':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-white/[0.08] dark:text-slate-200'
  }
}
