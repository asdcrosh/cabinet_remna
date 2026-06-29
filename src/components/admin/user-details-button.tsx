'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import { Eye, Laptop, Receipt, ShieldCheck } from 'lucide-react'
import { AdminModal } from '@/components/admin/admin-modal'

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

  return (
    <>
      <button
        type="button"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:bg-surface-900"
        onClick={() => setOpen(true)}
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

          <DetailSection icon={<ShieldCheck className="h-4 w-4" />} title="Подписки">
            {details.subscriptions.length > 0 ? (
              <div className="grid gap-2">
                {details.subscriptions.map((subscription) => (
                  <div key={subscription.id} className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
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
          </DetailSection>

          <DetailSection icon={<Receipt className="h-4 w-4" />} title="Платежи">
            {details.payments.length > 0 ? (
              <div className="grid gap-2">
                {details.payments.map((payment) => (
                  <div key={payment.id} className="grid gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-white/10 md:grid-cols-[1fr_auto_auto] md:items-center">
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
          </DetailSection>

          <DetailSection icon={<Laptop className="h-4 w-4" />} title="Устройства">
            {details.devices.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2">
                {details.devices.map((device) => (
                  <div key={device.hwid} className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
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
          </DetailSection>
        </div>
      </AdminModal>
    </>
  )
}

function DetailCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 truncate text-sm font-semibold ${mono ? 'font-mono' : ''}`}>{value || '—'}</div>
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
  return <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-slate-500">{text}</div>
}
