import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  Headphones,
  KeyRound,
  QrCode,
  Smartphone,
  Wifi,
} from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { getCurrentUser } from '@/lib/auth/cookies'
import { getBrandName } from '@/lib/branding'
import { legalNavigation } from '@/lib/legal-links'
import { logWarn } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { formatPrice } from '@/lib/format'

const serviceFacts = [
  {
    icon: Smartphone,
    title: 'Все основные устройства',
    description: 'iPhone, iPad, Android, macOS и Windows. Кабинет сам предложит подходящее приложение.',
  },
  {
    icon: CreditCard,
    title: 'Цена известна заранее',
    description: 'Период, стоимость и ограничения тарифа видны до регистрации и оплаты.',
  },
  {
    icon: Headphones,
    title: 'Помощь внутри кабинета',
    description: 'Поддержка видит тему обращения и отвечает в том же чате, без перехода в другие сервисы.',
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
  const publicPlans = await prisma.plan.findMany({
    where: {
      isActive: true,
      availability: 'ALL',
      isPromo: false,
    },
    orderBy: { sortOrder: 'asc' },
    take: 3,
    select: {
      id: true,
      name: true,
      description: true,
      priceKopecks: true,
      durationDays: true,
      deviceLimit: true,
      unlimitedDevices: true,
      unlimitedDuration: true,
      isFeatured: true,
    },
  }).catch((error: unknown) => {
    logWarn('home.public_plans_unavailable', { error })
    return []
  })

  return (
    <main className="site-shell min-h-dvh overflow-hidden pt-[var(--telegram-miniapp-safe-top)] text-slate-950 dark:text-white xl:pt-0">
      <section className="relative isolate border-b border-slate-200/80 dark:border-white/[0.08]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-1 bg-brand-400"
        />

        <header className="site-header mx-auto flex h-[4.5rem] max-w-[88rem] items-center justify-between gap-4 border-b px-4 sm:h-20 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={`${brandName}, главная`}>
            <BrandLogo className="h-10 w-10" priority />
            <span className="truncate text-sm font-semibold sm:text-base">{brandName}</span>
          </Link>

          <nav aria-label="Основная навигация" className="hidden items-center gap-6 text-sm font-medium text-slate-500 dark:text-slate-400 md:flex">
            <a href="#pricing" className="transition-colors hover:text-slate-950 dark:hover:text-white">Тарифы</a>
            <a href="#connection" className="transition-colors hover:text-slate-950 dark:hover:text-white">Подключение</a>
            <a href="#faq" className="transition-colors hover:text-slate-950 dark:hover:text-white">Вопросы</a>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link href="/login" className="btn-secondary min-h-10 px-3 py-2 sm:px-4">Войти</Link>
            <Link href="/register" className="btn-primary hidden min-h-10 px-4 py-2 sm:inline-flex">Создать аккаунт</Link>
          </div>
        </header>

        <div className="mx-auto grid max-w-[88rem] items-center gap-10 px-4 pb-12 pt-9 sm:px-6 sm:pb-16 sm:pt-12 lg:px-8 lg:py-16 min-[1180px]:min-h-[42rem] min-[1180px]:grid-cols-[minmax(0,1.05fr)_minmax(25rem,0.8fr)] min-[1180px]:gap-16">
          <div className="max-w-3xl">
            <div className="mb-5 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300">Простой VPN для ваших устройств</div>
            <h1 className="text-balance text-4xl font-semibold leading-[0.98] tracking-[-0.055em] text-slate-950 sm:text-6xl dark:text-white">
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
        <div className="mx-auto max-w-[88rem]">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl dark:text-white">Что важно знать до покупки</h2>
            <p className="mt-3 text-base leading-7 text-slate-500 dark:text-slate-400">Без скрытых шагов: сначала выбираете условия, затем создаёте аккаунт и подключаете устройство.</p>
          </div>

          <div className="mt-7 grid border-y border-slate-200/80 md:grid-cols-3 dark:border-white/[0.08]">
            {serviceFacts.map(({ icon: Icon, title, description }) => (
              <article key={title} className="border-slate-200/80 p-5 first:border-b sm:p-6 md:border-r md:first:border-b-0 md:last:border-r-0 dark:border-white/[0.08]">
                <Icon className="h-5 w-5 text-brand-600 dark:text-brand-300" />
                <h3 className="mt-4 text-base font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-8 px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8">
        <div className="mx-auto max-w-[88rem]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl dark:text-white">Тарифы без регистрации</h2>
              <p className="mt-3 text-base leading-7 text-slate-500 dark:text-slate-400">Один VPN, разные сроки. Продление не требует повторной настройки устройств.</p>
            </div>
            <Link href="/register" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
              Создать аккаунт
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {publicPlans.length > 0 ? (
            <div className="mt-7 grid gap-3 lg:grid-cols-3">
              {publicPlans.map((plan) => (
                <article
                  key={plan.id}
                  className={`relative flex min-h-64 flex-col rounded-2xl border bg-white p-5 dark:bg-white/[0.035] sm:p-6 ${plan.isFeatured ? 'border-brand-300 ring-1 ring-brand-200/70 dark:border-brand-300/30 dark:ring-brand-300/10' : 'border-slate-200 dark:border-white/[0.09]'}`}
                >
                  {plan.isFeatured ? <span className="mb-4 w-fit rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-400/10 dark:text-brand-200">Популярный выбор</span> : null}
                  <h3 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{plan.name}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {plan.description || `${formatPlanPeriod(plan.durationDays, plan.unlimitedDuration)} доступа к VPN.`}
                  </p>
                  <div className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">{formatPrice(plan.priceKopecks)}</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatPlanPeriod(plan.durationDays, plan.unlimitedDuration)}</div>
                  <div className="mt-4 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <BadgeCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                    {plan.unlimitedDevices ? 'Без ограничения устройств' : `До ${plan.deviceLimit} устройств`}
                  </div>
                  <Link href="/register" className="btn-primary mt-6 w-full justify-between">
                    Выбрать тариф
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-7 rounded-2xl border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
              Актуальные тарифы появятся здесь. Уточнить условия можно в поддержке.
            </div>
          )}
        </div>
      </section>

      <section id="connection" className="scroll-mt-8 px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8">
        <div className="site-band mx-auto grid max-w-[88rem] overflow-hidden border-l-2 border-brand-400 text-white min-[1180px]:grid-cols-[0.8fr_1.2fr]">
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
              <li key={number} className="site-band-step flex gap-3 p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-brand-300/30 font-mono text-xs font-semibold text-brand-200">{number}</span>
                <div>
                  <h3 className="font-semibold text-white">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-white/55">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="faq" className="scroll-mt-8 px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8">
        <div className="mx-auto max-w-[88rem]">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl dark:text-white">Частые вопросы</h2>
            <p className="mt-3 text-base leading-7 text-slate-500 dark:text-slate-400">Коротко о подключении, продлении и устройствах.</p>
          </div>
          <div className="mt-7 divide-y divide-slate-200 border-y border-slate-200 dark:divide-white/[0.09] dark:border-white/[0.09]">
            <FaqItem question="Что произойдёт после оплаты?">Кабинет создаст подписку и покажет приложение, ссылку и QR-код для вашего устройства.</FaqItem>
            <FaqItem question="Нужно ли настраивать VPN заново при продлении?">Нет. Оплаченный срок добавится к подписке, а текущие устройства продолжат работать.</FaqItem>
            <FaqItem question="Сколько устройств можно подключить?">Лимит указан в карточке тарифа. Подключёнными устройствами можно управлять в кабинете.</FaqItem>
            <FaqItem question="Что делать, если VPN не подключается?">Запустите встроенную проверку подключения или создайте обращение в поддержку. Ответ появится в кабинете.</FaqItem>
            <FaqItem question="Где посмотреть условия возврата?">Условия опубликованы на отдельной странице. <Link href="/refunds" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">Открыть условия возврата</Link>.</FaqItem>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200/80 px-4 py-8 sm:px-6 dark:border-white/[0.08]">
        <div className="mx-auto flex max-w-[88rem] flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold">
            <BrandLogo className="h-8 w-8" />
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

function formatPlanPeriod(durationDays: number, unlimitedDuration: boolean) {
  if (unlimitedDuration) return 'Бессрочный доступ'
  return `${durationDays} ${pluralDays(durationDays)}`
}

function pluralDays(value: number) {
  const mod100 = value % 100
  const mod10 = value % 10
  if (mod100 >= 11 && mod100 <= 14) return 'дней'
  if (mod10 === 1) return 'день'
  if (mod10 >= 2 && mod10 <= 4) return 'дня'
  return 'дней'
}

function FaqItem({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group py-4 sm:py-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-slate-950 dark:text-white [&::-webkit-details-marker]:hidden">
        {question}
        <span className="text-xl font-normal text-slate-400 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
      </summary>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">{children}</p>
    </details>
  )
}

function CabinetPreview({ brandName }: { brandName: string }) {
  return (
    <div
      role="img"
      aria-label="Пример личного кабинета с активной подпиской"
      className="relative mx-auto w-full max-w-xl lg:mx-0"
    >
      <div className="site-preview overflow-hidden border p-4">
        <div className="flex items-center justify-between px-1 pb-3">
          <div className="flex items-center gap-2.5">
            <BrandLogo className="h-8 w-8" />
            <div>
              <p className="max-w-40 truncate text-xs font-semibold text-slate-900 dark:text-white">{brandName}</p>
              <p className="text-[10px] text-slate-400">Личный кабинет</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-sm bg-emerald-50 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"><span className="h-1.5 w-1.5 bg-emerald-500" />Активна</span>
        </div>

        <div className="site-preview-access rounded-xl border-l-2 border-brand-400 p-4 text-white sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-white/50">Подписка</p>
              <p className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">26 дней осталось</p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-md border border-white/15 text-brand-200"><Wifi className="h-5 w-5" /></span>
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
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-slate-400">Следующий шаг</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">Подключить устройство</p>
            </div>
            <span className="flex min-h-9 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">
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
