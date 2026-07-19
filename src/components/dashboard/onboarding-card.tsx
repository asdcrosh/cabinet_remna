import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  KeyRound,
  MailCheck,
  QrCode,
  Send,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
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
  const steps = getSteps(state)
  const isFull = mode === 'full'
  const completedSteps = steps.filter((step) => step.done).length

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
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/[0.025] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.8fr)] lg:items-center lg:gap-7">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', toneClass(action?.tone ?? 'emerald'))}>
              {action?.icon ?? <ShieldCheck className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-200">
                {action ? 'Следующий шаг' : 'Готово'}
              </p>
              <h2 className="mt-1 text-xl font-semibold leading-tight tracking-tight text-slate-950 dark:text-white sm:text-2xl">
                {action?.title ?? 'Кабинет настроен'}
              </h2>
            </div>
          </div>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            {action?.description ?? 'Можно смотреть подписку, устройства, платежи и бонусы.'}
          </p>
          <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            {action ? (
              <Link href={action.href} className="btn-primary min-h-11 w-full justify-between rounded-2xl px-4 sm:w-auto sm:justify-center">
                {action.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link href="/dashboard/subscription" className="btn-primary min-h-11 w-full justify-between rounded-2xl px-4 sm:w-auto sm:justify-center">
                Открыть подписку
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {supportEnabled && (
              <Link href="/dashboard/support" className="inline-flex min-h-10 items-center justify-center rounded-2xl px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-cyan-700 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-cyan-200">
                Нужна помощь?
              </Link>
            )}
          </div>
        </div>

        <div className="rounded-3xl bg-slate-50 p-3.5 dark:bg-white/[0.035] sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Настройка кабинета</div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{completedSteps} из {steps.length} этапов готовы</div>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-white/[0.05] dark:text-slate-200 dark:ring-white/10">
              {completedSteps}/{steps.length}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5" aria-hidden="true">
            {steps.map((step) => (
              <span key={step.title} className={cn('h-1.5 rounded-full', step.done ? 'bg-cyan-500 dark:bg-cyan-300' : 'bg-slate-200 dark:bg-white/10')} />
            ))}
          </div>
          <details className="group mt-3">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-2xl px-2 text-sm font-medium text-slate-600 transition-colors hover:bg-white dark:text-slate-300 dark:hover:bg-white/[0.04]">
              Этапы настройки
              <span className="text-xs text-slate-400 group-open:hidden">Показать</span>
              <span className="hidden text-xs text-slate-400 group-open:inline">Скрыть</span>
            </summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {steps.map((step) => (
                <ChecklistItem key={step.title} {...step} />
              ))}
            </div>
          </details>
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

function getSteps(state: DashboardOnboardingState) {
  return [
    {
      done: state.hasLocalSubscription || state.hasRemnawaveProfile,
      title: 'Тариф',
      description: state.hasLocalSubscription || state.hasRemnawaveProfile ? 'Активен или синхронизирован' : 'Можно выбрать сейчас',
      icon: <ShoppingBag className="h-4 w-4" />,
    },
    {
      done: state.hasRemnawaveProfile,
      title: 'Подписка',
      description: state.hasRemnawaveProfile ? 'Профиль доступа создан' : 'Появится после оплаты',
      icon: <KeyRound className="h-4 w-4" />,
    },
    {
      done: state.deviceCount > 0,
      title: 'Устройства',
      description: state.deviceCount > 0 ? `${state.deviceCount} подключено` : 'Пока нет подключений',
      icon: <Smartphone className="h-4 w-4" />,
    },
    {
      done: state.telegramLinked && state.remnashopSynced,
      title: 'Telegram',
      description: state.telegramLinked
        ? state.remnashopSynced
          ? 'Синхронизирован'
          : 'Нужна проверка'
        : 'Можно привязать',
      icon: <Send className="h-4 w-4" />,
    },
  ]
}

function ChecklistItem({
  done,
  title,
  description,
  icon,
}: {
  done: boolean
  title: string
  description: string
  icon: ReactNode
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.035]">
      <div className={done ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'}>
        {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <span className="shrink-0 text-slate-400 dark:text-slate-500">{icon}</span>
          <span className="line-clamp-2 leading-tight">{title}</span>
        </div>
        <div className="line-clamp-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</div>
      </div>
    </div>
  )
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
