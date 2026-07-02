import type { ReactNode } from 'react'
import type { Prisma } from '@prisma/client'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  CheckCircle2,
  CreditCard,
  Database,
  ExternalLink,
  LockKeyhole,
  MailPlus,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/cookies'
import { formatPrice } from '@/lib/format'
import { getPendingPaymentTtlMs } from '@/lib/payment-sync'
import { prisma } from '@/lib/prisma'
import { ChangePasswordForm } from '@/components/dashboard/change-password-form'
import { ProfileForm } from '@/components/dashboard/profile-form'
import { SettingsTabs } from '@/components/dashboard/settings-tabs'
import { TelegramLinkCard } from '@/components/dashboard/telegram-link-card'
import { cn } from '@/lib/cn'

export const dynamic = 'force-dynamic'

const telegramClientId = process.env.TELEGRAM_CLIENT_ID?.trim() || null
const appUrl = process.env.APP_URL?.trim() || null

export default async function SettingsPage() {
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user) redirect('/login')
  const payments = await prisma.payment.findMany({
    where: { userId: session.uid },
    orderBy: { createdAt: 'desc' },
    take: 12,
    include: { plan: true, subscription: true },
  })
  const hasVerifiedEmail = Boolean(user.emailVerifiedAt && !user.email.endsWith('@pending.invalid'))

  return (
    <div className="mx-auto max-w-6xl space-y-3 sm:space-y-5">
      <div className="px-0.5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
          Настройки
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Аккаунт, синхронизация, безопасность и платежи
        </p>
      </div>

      <SettingsTabs
        sections={[
          {
            id: 'account',
            title: 'Аккаунт',
            shortTitle: 'Аккаунт',
            description: 'Инфа и статус',
            children: (
              <SettingsSection
                id="account"
                icon={<UserRound className="h-5 w-5" />}
                title="Аккаунт"
                description="Информация профиля и текущий статус"
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
                  <div className="min-w-0">
                    <div className="mb-4 grid gap-2 text-sm sm:grid-cols-3">
                      <AccountFact label="Email" value={hasVerifiedEmail ? user.email : 'не добавлен'} />
                      <AccountFact label="Регистрация" value={new Date(user.createdAt).toLocaleDateString('ru-RU')} />
                      <AccountFact label="VPN профиль" value={user.remnawaveUsername ? 'создан' : 'пока не создан'} />
                    </div>
                    <ProfileForm name={user.name} />
                  </div>
                  <StatusPanel
                    emailReady={hasVerifiedEmail}
                    telegramReady={Boolean(user.telegramId)}
                    vpnReady={Boolean(user.remnawaveUsername)}
                  />
                </div>
              </SettingsSection>
            ),
          },
          {
            id: 'sync',
            title: 'Синхронизация',
            shortTitle: 'Связь',
            description: 'Telegram и email',
            children: (
              <SettingsSection
                id="sync"
                icon={<Database className="h-5 w-5" />}
                title="Синхронизация"
                description="Перенос Telegram и привязка email"
              >
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
                  <TelegramLinkCard
                    telegramClientId={telegramClientId}
                    appUrl={appUrl}
                    telegramId={user.telegramId?.toString() ?? null}
                    telegramUsername={user.telegramUsername}
                    remnashopUserId={user.remnashopUserId}
                    remnawaveUsername={user.remnawaveUsername}
                    embedded
                  />
                  <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-surface-950/45">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">
                        <MailPlus className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-950 dark:text-white">Email</h3>
                        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                          {hasVerifiedEmail ? 'Email подтверждён' : 'Добавьте email для входа'}
                        </p>
                      </div>
                    </div>
                    {!hasVerifiedEmail && user.telegramId ? (
                      <Link href="/telegram-email" className="btn-primary mt-4 w-full justify-center">
                        Добавить email
                      </Link>
                    ) : (
                      <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
                        {hasVerifiedEmail ? user.email : 'Сначала привяжите Telegram.'}
                      </div>
                    )}
                  </div>
                </div>
              </SettingsSection>
            ),
          },
          {
            id: 'security',
            title: 'Безопасность',
            shortTitle: 'Пароль',
            description: 'Смена пароля',
            children: (
              <SettingsSection
                id="security"
                icon={<LockKeyhole className="h-5 w-5" />}
                title="Безопасность"
                description="Смена пароля для входа по email"
              >
                {hasVerifiedEmail ? (
                  <ChangePasswordForm />
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    Добавьте и подтвердите email, чтобы включить вход по паролю.
                  </div>
                )}
              </SettingsSection>
            ),
          },
          {
            id: 'payments',
            title: 'История платежей',
            shortTitle: 'Платежи',
            description: `${payments.length} записей`,
            children: (
              <SettingsSection
                id="payments"
                icon={<CreditCard className="h-5 w-5" />}
                title="История платежей"
                description="Оплаты, статусы и выдача подписки"
              >
                <PaymentHistory payments={payments} />
              </SettingsSection>
            ),
          },
        ]}
      />
    </div>
  )
}

function SettingsSection({
  id,
  icon,
  title,
  description,
  children,
  className,
}: {
  id: string
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-4 overflow-hidden rounded-lg border border-slate-200/80 bg-white/90 shadow-sm shadow-slate-200/50 backdrop-blur dark:border-white/10 dark:bg-white/[0.045] dark:shadow-black/20',
        className
      )}
    >
      <div className="border-b border-slate-100 bg-slate-50/55 px-3 py-3 dark:border-white/10 dark:bg-white/[0.025] sm:px-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 shadow-sm dark:bg-cyan-300/10 dark:text-cyan-200">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white sm:text-lg">{title}</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  )
}

function AccountFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-surface-950/45">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 truncate font-medium text-slate-950 dark:text-white">{value}</div>
    </div>
  )
}

function StatusPanel({
  emailReady,
  telegramReady,
  vpnReady,
}: {
  emailReady: boolean
  telegramReady: boolean
  vpnReady: boolean
}) {
  const readyCount = [emailReady, telegramReady, vpnReady].filter(Boolean).length

  return (
    <div className="rounded-lg border border-slate-200/80 bg-white/90 p-3 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-white/[0.045] dark:shadow-black/20">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-950 dark:text-white">Статус аккаунта</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{readyCount}/3 готово</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        <StatusLine label="Email" value={emailReady ? 'подтверждён' : 'не добавлен'} active={emailReady} />
        <StatusLine label="Telegram" value={telegramReady ? 'привязан' : 'не привязан'} active={telegramReady} />
        <StatusLine label="VPN" value={vpnReady ? 'готов' : 'пока нет'} active={vpnReady} />
      </div>
    </div>
  )
}

function StatusLine({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-sm dark:border-white/10 dark:bg-surface-950/45">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`inline-flex items-center gap-1.5 font-medium ${active ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-400'}`}>
        {active ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
        {value}
      </span>
    </div>
  )
}

type SettingsPayment = Prisma.PaymentGetPayload<{ include: { plan: true; subscription: true } }>

function PaymentHistory({ payments }: { payments: SettingsPayment[] }) {
  if (payments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-5 text-center dark:border-white/10 dark:bg-surface-950/45">
        <div className="font-semibold text-slate-950 dark:text-white">Платежей пока нет</div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          После покупки здесь появятся сумма, статус и выданная подписка.
        </p>
        <Link href="/dashboard/plans" className="btn-primary mt-4 inline-flex">
          Выбрать тариф
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="table-shell hidden xl:block">
        <table className="data-table min-w-[880px]">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-surface-800">
            <tr>
              <th>Дата</th>
              <th>Тариф</th>
              <th>Сумма</th>
              <th>Промокод</th>
              <th>Статус</th>
              <th>Подписка</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{new Date(payment.createdAt).toLocaleString('ru-RU')}</td>
                <td>{payment.plan.name}</td>
                <td>
                  <PaymentAmount
                    amountKopecks={payment.amountKopecks}
                    originalAmountKopecks={payment.originalAmountKopecks}
                    discountKopecks={payment.discountKopecks}
                  />
                </td>
                <td className="text-slate-500">{getPromoCodeLabel(payment.promoCodeSnapshot)}</td>
                <td><PaymentStatusBadge status={payment.status} createdAt={payment.createdAt} /></td>
                <td><ProvisioningBadge provisioned={Boolean(payment.subscriptionProvisionedAt)} status={payment.status} /></td>
                <td><PaymentAction confirmationUrl={payment.confirmationUrl} status={payment.status} createdAt={payment.createdAt} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 xl:hidden">
        {payments.map((payment) => (
          <article key={payment.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-surface-900">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-surface-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">{payment.plan.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{formatPaymentDate(payment.createdAt)}</div>
                </div>
                <PaymentStatusBadge status={payment.status} createdAt={payment.createdAt} />
              </div>
            </div>
            <div className="space-y-3 px-4 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs uppercase tracking-wide text-slate-400">Сумма</span>
                <PaymentAmount
                  amountKopecks={payment.amountKopecks}
                  originalAmountKopecks={payment.originalAmountKopecks}
                  discountKopecks={payment.discountKopecks}
                  align="right"
                />
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <AccountFact label="Подписка" value={getProvisioningLabel(Boolean(payment.subscriptionProvisionedAt), payment.status)} />
                <AccountFact label="Промокод" value={getPromoCodeLabel(payment.promoCodeSnapshot)} />
                <AccountFact label="ID оплаты" value={payment.yookassaId ? shortId(payment.yookassaId) : shortId(payment.id)} />
              </div>
              <PaymentAction confirmationUrl={payment.confirmationUrl} status={payment.status} createdAt={payment.createdAt} fullWidth />
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function PaymentAmount({
  amountKopecks,
  originalAmountKopecks,
  discountKopecks,
  align = 'left',
}: {
  amountKopecks: number
  originalAmountKopecks: number | null
  discountKopecks: number
  align?: 'left' | 'right'
}) {
  const hasDiscount = discountKopecks > 0 && originalAmountKopecks != null

  return (
    <div className={align === 'right' ? 'text-right' : undefined}>
      <div className="font-medium">{formatPrice(amountKopecks)}</div>
      {hasDiscount && (
        <div className="text-xs text-slate-400">
          <span className="line-through">{formatPrice(originalAmountKopecks)}</span>
          <span className="ml-1 text-emerald-600">-{formatPrice(discountKopecks)}</span>
        </div>
      )}
    </div>
  )
}

function PaymentAction({
  confirmationUrl,
  status,
  createdAt,
  fullWidth = false,
}: {
  confirmationUrl: string | null
  status: string
  createdAt: Date
  fullWidth?: boolean
}) {
  if (status === 'PENDING' && !isFreshPendingPayment(createdAt)) {
    return <span className="text-sm text-slate-400">Ссылка устарела</span>
  }
  if (status !== 'PENDING' || !confirmationUrl) return <span className="text-sm text-slate-400">—</span>
  return (
    <a
      href={confirmationUrl}
      className={`btn-secondary min-h-9 px-3 py-1.5 text-xs ${fullWidth ? 'w-full justify-center' : ''}`}
      target="_blank"
      rel="noreferrer"
    >
      <ExternalLink className="h-4 w-4" />
      Оплатить
    </a>
  )
}

function PaymentStatusBadge({ status, createdAt }: { status: string; createdAt: Date }) {
  if (status === 'PENDING' && !isFreshPendingPayment(createdAt)) {
    return <span className="badge-disabled">Истёк</span>
  }
  const map: Record<string, string> = {
    SUCCEEDED: 'badge-active',
    PENDING: 'badge-limited',
    CANCELED: 'badge-disabled',
    REFUNDED: 'badge-disabled',
  }
  const labels: Record<string, string> = {
    SUCCEEDED: 'Оплачен',
    PENDING: 'Ожидает',
    CANCELED: 'Отменён',
    REFUNDED: 'Возврат',
  }
  return <span className={map[status] ?? 'badge-disabled'}>{labels[status] ?? status}</span>
}

function ProvisioningBadge({ provisioned, status }: { provisioned: boolean; status: string }) {
  if (provisioned) return <span className="badge-active">Выдана</span>
  if (status === 'SUCCEEDED') return <span className="badge-limited">Выдача идет</span>
  if (status === 'PENDING') return <span className="badge-disabled">После оплаты</span>
  return <span className="text-slate-400">—</span>
}

function getPromoCodeLabel(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return '—'
  const code = (snapshot as { code?: unknown }).code
  return typeof code === 'string' && code ? code : '—'
}

function getProvisioningLabel(provisioned: boolean, status: string) {
  if (provisioned) return 'Выдана'
  if (status === 'SUCCEEDED') return 'Выдача идет'
  if (status === 'PENDING') return 'После оплаты'
  return '—'
}

function formatPaymentDate(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

function isFreshPendingPayment(createdAt: Date) {
  return createdAt.getTime() > Date.now() - getPendingPaymentTtlMs()
}
