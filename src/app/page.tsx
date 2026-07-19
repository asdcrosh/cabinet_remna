import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleGauge,
  CreditCard,
  KeyRound,
  Laptop,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wifi,
  Zap,
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/cookies'
import { getBrandName } from '@/lib/branding'
import { legalNavigation } from '@/lib/legal-links'
import { logWarn } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

const benefits = [
  {
    icon: QrCode,
    title: 'Подключение за пару шагов',
    description: 'Ссылка, QR-код и готовые инструкции для ваших устройств всегда под рукой.',
  },
  {
    icon: CircleGauge,
    title: 'Всё видно сразу',
    description: 'Срок подписки, расход трафика и подключённые устройства собраны на одном экране.',
  },
  {
    icon: CreditCard,
    title: 'Продление без путаницы',
    description: 'Выберите подходящий период и продолжайте пользоваться VPN без повторной настройки.',
  },
] as const

const steps = [
  ['01', 'Создайте аккаунт', 'Понадобится только email и пароль.'],
  ['02', 'Выберите подписку', 'Оплатите подходящий период в личном кабинете.'],
  ['03', 'Подключите устройство', 'Откройте приложение по ссылке или отсканируйте QR-код.'],
] as const

export default async function HomePage() {
  const session = await getCurrentUser()
  if (session) {
    const user = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { id: true },
    })
    if (user) redirect('/dashboard')
    logWarn('auth.home.stale_session_ignored', { userId: session.uid })
  }

  const brandName = getBrandName()

  return (
    <main className="min-h-dvh overflow-hidden bg-slate-50 text-slate-950 dark:bg-surface-950 dark:text-white">
      <section className="relative isolate border-b border-slate-200/80 dark:border-white/[0.08]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_8%,rgba(14,165,233,0.14),transparent_32rem),radial-gradient(circle_at_92%_38%,rgba(16,185,129,0.11),transparent_26rem)] dark:bg-[radial-gradient(circle_at_18%_8%,rgba(14,165,233,0.14),transparent_32rem),radial-gradient(circle_at_92%_38%,rgba(16,185,129,0.08),transparent_26rem)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] opacity-[0.035] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:32px_32px] [mask-image:linear-gradient(to_bottom,black,transparent)] dark:opacity-[0.045]"
        />

        <header className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={`${brandName}, главная`}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/10 dark:bg-white dark:text-slate-950">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span className="truncate text-sm font-semibold sm:text-base">{brandName}</span>
          </Link>

          <nav aria-label="Основная навигация" className="hidden items-center gap-6 text-sm font-medium text-slate-500 dark:text-slate-400 md:flex">
            <a href="#advantages" className="transition-colors hover:text-slate-950 dark:hover:text-white">Возможности</a>
            <a href="#connection" className="transition-colors hover:text-slate-950 dark:hover:text-white">Подключение</a>
            <Link href="/contacts" className="transition-colors hover:text-slate-950 dark:hover:text-white">Поддержка</Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link href="/login" className="btn-secondary min-h-10 px-3 py-2 sm:px-4">Войти</Link>
            <Link href="/register" className="btn-primary hidden min-h-10 px-4 py-2 sm:inline-flex">Создать аккаунт</Link>
          </div>
        </header>

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(26rem,0.86fr)] lg:gap-16 lg:px-8 lg:pb-24 lg:pt-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50/80 px-3 py-1.5 text-xs font-semibold text-cyan-800 dark:border-cyan-300/15 dark:bg-cyan-300/[0.07] dark:text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" />
              Личный VPN-кабинет
            </div>
            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl lg:leading-[1.04] dark:text-white">
              VPN без сложных настроек и лишних экранов
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8 dark:text-slate-300">
              Подключайте устройства, следите за подпиской и продлевайте доступ в одном понятном кабинете.
            </p>

            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
              <Link href="/register" className="btn-primary w-full px-5 sm:w-auto">
                Начать пользоваться
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login" className="btn-secondary w-full px-5 sm:w-auto">У меня уже есть аккаунт</Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />Быстрое подключение</span>
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />Управление устройствами</span>
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />Поддержка в кабинете</span>
            </div>
          </div>

          <CabinetPreview brandName={brandName} />
        </div>
      </section>

      <section id="advantages" className="scroll-mt-8 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Без лишнего</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl dark:text-white">Всё нужное на своём месте</h2>
            <p className="mt-3 text-base leading-7 text-slate-500 dark:text-slate-400">Кабинет подсказывает следующий шаг и не перегружает техническими деталями.</p>
          </div>

          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {benefits.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.55)] sm:p-6 dark:border-white/[0.08] dark:bg-white/[0.035] dark:shadow-none">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-800 dark:bg-white/[0.07] dark:text-cyan-200">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="connection" className="scroll-mt-8 px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
        <div className="mx-auto grid max-w-7xl overflow-hidden rounded-[2rem] bg-slate-950 text-white lg:grid-cols-[0.92fr_1.08fr]">
          <div className="relative isolate p-6 sm:p-9 lg:p-12">
            <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.16),transparent_25rem)]" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">Три понятных шага</p>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">От регистрации до подключения за один маршрут</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/60 sm:text-base sm:leading-7">После оплаты кабинет покажет данные подписки и предложит подходящий способ подключения.</p>
            <Link href="/register" className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-100">
              Создать аккаунт
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <ol className="grid gap-px bg-white/[0.08] sm:grid-cols-3 lg:grid-cols-1">
            {steps.map(([number, title, description]) => (
              <li key={number} className="flex gap-4 bg-slate-900/95 p-5 sm:p-6 lg:items-center lg:px-8">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-xs font-semibold text-cyan-200">{number}</span>
                <div>
                  <h3 className="font-semibold text-white">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-white/55">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8 dark:border-white/[0.08] dark:bg-white/[0.035]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Готовы подключиться?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Создайте аккаунт или войдите, если уже пользуетесь сервисом.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/login" className="btn-secondary w-full sm:w-auto">Войти</Link>
            <Link href="/register" className="btn-primary w-full sm:w-auto">Создать аккаунт</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200/80 px-4 py-8 sm:px-6 dark:border-white/[0.08]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950"><ShieldCheck className="h-4 w-4" /></span>
            {brandName}
          </Link>
          <nav aria-label="Правовая информация" className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
            {legalNavigation.map((item) => <Link key={item.href} href={item.href} className="transition-colors hover:text-slate-950 dark:hover:text-white">{item.label}</Link>)}
          </nav>
        </div>
      </footer>
    </main>
  )
}

function CabinetPreview({ brandName }: { brandName: string }) {
  return (
    <div
      role="img"
      aria-label="Пример личного кабинета с активной подпиской"
      className="relative mx-auto w-full max-w-xl lg:mx-0"
    >
      <div aria-hidden="true" className="absolute -inset-5 -z-10 rounded-[2.5rem] bg-gradient-to-br from-cyan-400/15 via-transparent to-emerald-400/10 blur-2xl" />
      <div className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white/95 p-3 shadow-[0_36px_100px_-50px_rgba(15,23,42,0.55)] backdrop-blur sm:p-4 dark:border-white/10 dark:bg-slate-900/90 dark:shadow-none">
        <div className="flex items-center justify-between px-1 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950"><ShieldCheck className="h-4 w-4" /></span>
            <div>
              <p className="max-w-40 truncate text-xs font-semibold text-slate-900 dark:text-white">{brandName}</p>
              <p className="text-[10px] text-slate-400">Личный кабинет</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Активна</span>
        </div>

        <div className="rounded-3xl bg-slate-950 p-4 text-white sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-white/50">Подписка</p>
              <p className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">26 дней осталось</p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-cyan-200"><Wifi className="h-5 w-5" /></span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.05] p-3">
              <p className="text-[10px] uppercase tracking-wide text-white/40">Трафик</p>
              <p className="mt-1 text-sm font-semibold">12,8 ГБ</p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.05] p-3">
              <p className="text-[10px] uppercase tracking-wide text-white/40">Устройства</p>
              <p className="mt-1 text-sm font-semibold">2 подключено</p>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.035]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-400">Быстрое действие</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">Подключить устройство</p>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-slate-700 shadow-sm dark:bg-white/[0.07] dark:text-cyan-200"><Zap className="h-4 w-4" /></span>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="flex h-9 flex-1 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white dark:bg-white dark:text-slate-950"><KeyRound className="h-3.5 w-3.5" />Получить ссылку</span>
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/[0.04]"><QrCode className="h-4 w-4" /></span>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.035]">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white"><Activity className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />Последние устройства</div>
            <div className="mt-3 space-y-2">
              <PreviewDevice icon={<Smartphone className="h-3.5 w-3.5" />} name="Телефон" />
              <PreviewDevice icon={<Laptop className="h-3.5 w-3.5" />} name="Ноутбук" />
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 text-xs text-emerald-800 dark:border-emerald-400/10 dark:bg-emerald-400/[0.06] dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Подключение готово к использованию
        </div>
      </div>
    </div>
  )
}

function PreviewDevice({ icon, name }: { icon: React.ReactNode; name: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-2.5 py-2 text-[11px] text-slate-600 shadow-sm dark:bg-white/[0.05] dark:text-slate-300">
      <span className="flex items-center gap-2"><span className="text-slate-400">{icon}</span>{name}</span>
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
    </div>
  )
}
