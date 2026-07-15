'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import { Eye, Laptop, Receipt, ShieldCheck, UserRound } from 'lucide-react'
import { AdminModal } from '@/components/admin/admin-modal'
import { Tabs } from '@/components/ui/tabs'

export interface AdminUserDetails {
  email: string
  name: string
  role: string
  createdAt: string
  lastLoginAt: string
  emailVerifiedAt: string
  telegram: string
  remnashop: string
  remnawaveUsername: string
  remnawaveUuid: string
  remnawaveShortUuid: string
  subscriptions: Array<{
    id: string
    plan: string
    status: string
    startAt: string
    expireAt: string
    traffic: string
    syncedAt: string
  }>
  payments: Array<{
    id: string
    plan: string
    status: string
    amount: string
    paidAt: string
    createdAt: string
  }>
  devices: Array<{
    hwid: string
    platform: string
    ip: string
    lastSeenAt: string
  }>
}

export function UserDetailsButton({ details }: { details: AdminUserDetails }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'PROFILE' | 'SUBSCRIPTIONS' | 'PAYMENTS' | 'DEVICES'>('PROFILE')

  return (
    <>
      <button
        type="button"
        className="btn-secondary h-9 min-h-9 w-9 shrink-0 px-0"
        onClick={() => {
          setTab('PROFILE')
          setOpen(true)
        }}
        title="Открыть пользователя"
        aria-label="Открыть пользователя"
      >
        <Eye className="h-4 w-4" />
      </button>

      <AdminModal
        open={open}
        onClose={() => setOpen(false)}
        title={details.email}
        description={`${details.name} · ${details.role}`}
        size="xl"
      >
        <div className="space-y-5">
          <UserStatusOverview details={details} />
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="w-full"
            items={[
              { value: 'PROFILE', label: 'Профиль' },
              { value: 'SUBSCRIPTIONS', label: `Подписки ${details.subscriptions.length}` },
              { value: 'PAYMENTS', label: `Платежи ${details.payments.length}` },
              { value: 'DEVICES', label: `Устройства ${details.devices.length}` },
            ]}
          />

          {tab === 'PROFILE' ? (
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <DetailCard label="Регистрация" value={details.createdAt} />
              <DetailCard label="Последний вход" value={details.lastLoginAt} />
              <DetailCard label="Email" value={details.emailVerifiedAt} />
              <DetailCard label="Telegram" value={details.telegram} mono />
              <DetailCard label="Remnashop" value={details.remnashop} mono />
              <DetailCard label="Remnawave username" value={details.remnawaveUsername} mono />
              <DetailCard label="Remnawave UUID" value={details.remnawaveUuid} mono />
              <DetailCard label="Short UUID" value={details.remnawaveShortUuid} mono />
            </section>
          ) : null}

          {tab === 'SUBSCRIPTIONS' ? <DetailSection icon={<ShieldCheck className="h-4 w-4" />} title="Подписки">
            {details.subscriptions.length > 0 ? (
              <div className="grid gap-2">
                {details.subscriptions.map((subscription) => (
                  <div key={subscription.id} className="rounded-xl border border-slate-200 bg-slate-50/40 p-3 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{subscription.plan}</div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-white/10">
                        {subscription.status}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 text-sm text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
                      <span>Старт: {subscription.startAt}</span>
                      <span>До: {subscription.expireAt}</span>
                      <span>{subscription.traffic}</span>
                      <span>Sync: {subscription.syncedAt}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyLine text="Подписок нет" />
            )}
          </DetailSection> : null}

          {tab === 'PAYMENTS' ? <DetailSection icon={<Receipt className="h-4 w-4" />} title="Платежи">
            {details.payments.length > 0 ? (
              <div className="grid gap-2">
                {details.payments.map((payment) => (
                  <div key={payment.id} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/40 p-3 text-sm dark:border-white/10 dark:bg-white/[0.02] md:grid-cols-[1fr_auto_auto] md:items-center">
                    <div>
                      <div className="font-medium">{payment.plan}</div>
                      <div className="font-mono text-xs text-slate-400">{payment.id}</div>
                    </div>
                    <div className="text-slate-500">{payment.createdAt}</div>
                    <div className="font-semibold">{payment.amount} · {payment.status}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyLine text="Платежей нет" />
            )}
          </DetailSection> : null}

          {tab === 'DEVICES' ? <DetailSection icon={<Laptop className="h-4 w-4" />} title="Устройства">
            {details.devices.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2">
                {details.devices.map((device) => (
                  <div key={device.hwid} className="rounded-xl border border-slate-200 bg-slate-50/40 p-3 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="font-medium">{device.platform}</div>
                    <div className="mt-1 truncate font-mono text-xs text-slate-500">{device.hwid}</div>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
                      <span>{device.ip}</span>
                      <span>{device.lastSeenAt}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyLine text="Устройств нет" />
            )}
          </DetailSection> : null}
        </div>
      </AdminModal>
    </>
  )
}

function UserStatusOverview({ details }: { details: AdminUserDetails }) {
  const subscription = details.subscriptions[0]
  const hasTelegram = isConnected(details.telegram)
  const hasRemnashop = isConnected(details.remnashop)
  const hasRemnawave = isConnected(details.remnawaveUsername) || isConnected(details.remnawaveUuid)

  return (
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03] sm:grid-cols-2 xl:grid-cols-4">
      <StatusCell icon={<UserRound className="h-4 w-4" />} label="Аккаунт" value={details.role} active />
      <StatusCell icon={<ShieldCheck className="h-4 w-4" />} label="Подписка" value={subscription?.status || 'Нет подписки'} active={Boolean(subscription)} />
      <StatusCell icon={<Receipt className="h-4 w-4" />} label="Оплаты" value={String(details.payments.length)} active={details.payments.length > 0} />
      <StatusCell icon={<Laptop className="h-4 w-4" />} label="Связи" value={`${Number(hasTelegram) + Number(hasRemnashop) + Number(hasRemnawave)}/3`} active={hasTelegram && hasRemnashop && hasRemnawave} />
    </section>
  )
}

function StatusCell({ icon, label, value, active }: { icon: ReactNode; label: string; value: string; active: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 dark:bg-surface-900">
      <span className={active ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-400'}>{icon}</span>
      <div className="min-w-0">
        <div className="text-xs text-slate-400">{label}</div>
        <div className="truncate text-sm font-semibold">{value}</div>
      </div>
    </div>
  )
}

function isConnected(value: string) {
  const normalized = value.trim().toLowerCase()
  return Boolean(normalized && normalized !== '—' && normalized !== 'нет' && normalized !== 'не привязан')
}

function DetailCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${mono ? 'break-all font-mono' : 'truncate'}`}>{value || '—'}</div>
    </div>
  )
}

function DetailSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-slate-500">{text}</div>
}
