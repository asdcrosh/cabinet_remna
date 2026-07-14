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

  if (!action && !isFull) return null

  return (
    <section className={`card relative overflow-hidden ${isFull ? 'p-5 sm:p-6' : 'p-4'}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-400 to-brand-500" />
      <div className={`grid gap-4 ${isFull ? 'lg:grid-cols-[0.9fr_1.1fr] lg:items-center' : 'xl:grid-cols-[0.85fr_1.15fr] xl:items-center'}`}>
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <div className={`grid shrink-0 place-items-center rounded-lg ${toneClass(action?.tone ?? 'emerald')} ${isFull ? 'h-11 w-11' : 'h-10 w-10'}`}>
              {action?.icon ?? <ShieldCheck className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-200">
                {action ? 'Следующий шаг' : 'Готово'}
              </p>
              <h2 className={`${isFull ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'} truncate font-semibold`}>
                {action?.title ?? 'Кабинет настроен'}
              </h2>
            </div>
          </div>
          <p className="max-w-xl text-sm text-slate-500 dark:text-slate-400">
            {action?.description ?? 'Можно смотреть подписку, устройства, платежи и бонусы.'}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {action ? (
              <Link href={action.href} className="btn-primary min-h-9 px-3 py-1.5">
                {action.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link href="/dashboard/subscription" className="btn-primary min-h-9 px-3 py-1.5">
                Открыть подписку
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {supportEnabled && (
              <Link href="/dashboard/support" className="text-sm font-medium text-slate-500 hover:text-cyan-700 dark:text-slate-400 dark:hover:text-cyan-200">
                Нужна помощь?
              </Link>
            )}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {steps.map((step) => (
            <ChecklistItem key={step.title} {...step} />
          ))}
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
    <div className="flex min-h-16 items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-surface-800/70">
      <div className={done ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'}>
        {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <span className="shrink-0 text-slate-400 dark:text-slate-500">{icon}</span>
          <span className="truncate">{title}</span>
        </div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{description}</div>
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
      return 'bg-slate-950 text-cyan-200 dark:bg-white dark:text-slate-950'
  }
}
