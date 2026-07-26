import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowRight,
  CircleGauge,
  CreditCard,
  KeyRound,
  QrCode,
  ShieldCheck,
  Wifi,
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
    <main className="min-h-dvh overflow-hidden bg-[#f4f5f1] text-slate-950 dark:bg-[#0a0c0d] dark:text-white">
      <section className="relative isolate border-b border-slate-200/80 dark:border-white/[0.08]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-1 bg-cyan-400"
        />

        <header className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-4 border-b border-slate-200/80 px-4 sm:h-20 sm:px-6 lg:px-8 dark:border-white/[0.08]">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={`${brandName}, главная`}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-950 text-white dark:bg-white dark:text-slate-950">
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

        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-12 pt-9 sm:px-6 sm:pb-16 sm:pt-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(25rem,0.8fr)] lg:gap-14 lg:px-8 lg:py-16">
          <div className="max-w-3xl">
            <div className="dashboard-signal mb-5 h-1 w-12" aria-hidden="true" />
            <h1 className="text-balance text-4xl font-semibold leading-[1.05] text-slate-950 sm:text-5xl dark:text-white">
              VPN, который не требует разбираться в VPN
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg dark:text-slate-300">
              Подключение, срок и оплата собраны в одном спокойном кабинете. Технические детали показываем только когда они нужны.
            </p>

            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
              <Link href="/register" className="btn-primary w-full px-5 sm:w-auto">
                Начать пользоваться
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login" className="btn-secondary w-full px-5 sm:w-auto">У меня уже есть аккаунт</Link>
            </div>

          </div>

          <CabinetPreview brandName={brandName} />
        </div>
      </section>

      <section id="advantages" className="scroll-mt-8 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl dark:text-white">Три вещи, которые всегда под рукой</h2>
            <p className="mt-3 text-base leading-7 text-slate-500 dark:text-slate-400">Кабинет подсказывает следующий шаг и не перегружает техническими деталями.</p>
          </div>

          <div className="mt-7 grid border-y border-slate-200/80 md:grid-cols-3 dark:border-white/[0.08]">
            {benefits.map(({ icon: Icon, title, description }) => (
              <article key={title} className="border-slate-200/80 p-5 first:border-b sm:p-6 md:border-r md:first:border-b-0 md:last:border-r-0 dark:border-white/[0.08]">
                <Icon className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
                <h3 className="mt-4 text-base font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="connection" className="scroll-mt-8 px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8">
        <div className="mx-auto grid max-w-7xl overflow-hidden border-l-4 border-cyan-400 bg-slate-950 text-white lg:grid-cols-[0.8fr_1.2fr]">
          <div className="relative isolate p-6 sm:p-8 lg:p-10">
            <h2 className="max-w-xl text-2xl font-semibold sm:text-3xl">От регистрации до подключения</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/60 sm:text-base sm:leading-7">После оплаты кабинет покажет данные подписки и предложит подходящий способ подключения.</p>
            <Link href="/register" className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-100">
              Создать аккаунт
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <ol className="grid gap-px bg-white/[0.08] sm:grid-cols-3">
            {steps.map(([number, title, description]) => (
              <li key={number} className="flex gap-3 bg-slate-900/95 p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-cyan-300/30 font-mono text-xs font-semibold text-cyan-200">{number}</span>
                <div>
                  <h3 className="font-semibold text-white">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-white/55">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-slate-200/80 px-4 py-8 sm:px-6 dark:border-white/[0.08]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-950 text-white dark:bg-white dark:text-slate-950"><ShieldCheck className="h-4 w-4" /></span>
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
      <div className="overflow-hidden border border-slate-200/90 border-t-2 border-t-cyan-400 bg-white p-4 dark:border-white/10 dark:border-t-cyan-300 dark:bg-slate-900">
        <div className="flex items-center justify-between px-1 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-950 text-white dark:bg-white dark:text-slate-950"><ShieldCheck className="h-4 w-4" /></span>
            <div>
              <p className="max-w-40 truncate text-xs font-semibold text-slate-900 dark:text-white">{brandName}</p>
              <p className="text-[10px] text-slate-400">Личный кабинет</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-sm bg-emerald-50 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"><span className="h-1.5 w-1.5 bg-emerald-500" />Активна</span>
        </div>

        <div className="border-l-2 border-cyan-400 bg-slate-950 p-4 text-white sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-white/50">Подписка</p>
              <p className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">26 дней осталось</p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-md border border-white/15 text-cyan-200"><Wifi className="h-5 w-5" /></span>
          </div>
          <div className="mt-5 grid grid-cols-2 border-t border-white/10 pt-4">
            <div className="border-r border-white/10 pr-3">
              <p className="font-mono text-[9px] uppercase tracking-wide text-white/40">Трафик</p>
              <p className="mt-1 text-sm font-semibold">12,8 ГБ</p>
            </div>
            <div className="pl-4">
              <p className="font-mono text-[9px] uppercase tracking-wide text-white/40">Устройства</p>
              <p className="mt-1 text-sm font-semibold">2 подключено</p>
            </div>
          </div>
        </div>

        <div className="mt-3 border-y border-slate-200 py-4 dark:border-white/[0.08]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">Следующий шаг</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">Подключить устройство</p>
            </div>
            <span className="flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">
              <KeyRound className="h-3.5 w-3.5" />
              Получить ссылку
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>Ссылка и QR-код доступны в кабинете</span>
          <QrCode className="h-4 w-4 shrink-0" />
        </div>
      </div>
    </div>
  )
}
