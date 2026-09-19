import type { ReactNode } from 'react'
import Link from 'next/link'
import { KeysCard } from './keys-card'
import { PageHeader } from './page-header'
import { VpnConnectionCheck } from './vpn-connection-check'

export function ConnectionPage({ subscriptionUrl, happLink, supportEnabled, deviceLimit, expired, hasConnectedDevices = false, accessIssue, notice, children }: {
  subscriptionUrl: string
  happLink?: string | null
  supportEnabled: boolean
  deviceLimit?: number | null
  expired: boolean
  hasConnectedDevices?: boolean
  accessIssue?: { title: string; description: string } | null
  notice?: ReactNode
  children: ReactNode
}) {
  const accessBlocked = expired || Boolean(accessIssue)
  return (
    <div className="user-workspace page-stack mx-auto w-full max-w-2xl">
      <PageHeader title="Подключение" description={accessIssue?.description ?? (expired ? 'Продлите доступ, чтобы пользоваться VPN.' : 'Настроим VPN на этом устройстве.')} />
      {!accessBlocked && (
        <>
          {notice}
          {hasConnectedDevices ? (
            <>
              <section className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06] sm:p-6">
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">VPN уже настраивали</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  В аккаунте есть подключённые устройства. Если приложение уже установлено здесь, проверьте соединение без повторной настройки.
                </p>
                <div className="mt-4">
                  <VpnConnectionCheck supportEnabled={supportEnabled} deviceLimit={deviceLimit} compact />
                </div>
              </section>
              <details className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                <summary className="cursor-pointer text-sm font-medium">Настроить это устройство заново</summary>
                <div className="mt-4">
                  <KeysCard subscriptionUrl={subscriptionUrl} happLink={happLink} supportEnabled={supportEnabled} deviceLimit={deviceLimit} />
                </div>
              </details>
            </>
          ) : (
            <KeysCard subscriptionUrl={subscriptionUrl} happLink={happLink} supportEnabled={supportEnabled} deviceLimit={deviceLimit} />
          )}
          <details className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
            <summary className="cursor-pointer text-sm font-medium">Как подключить другое устройство</summary>
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">Откройте этот кабинет на другом телефоне или компьютере и войдите в тот же аккаунт. В разделе «VPN» пройдите эти же три шага. Устройство появится в списке автоматически.</p>
          </details>
          <Link href="/dashboard/devices" className="py-2 text-sm text-slate-500 underline dark:text-slate-400">Мои устройства</Link>
        </>
      )}
      <details open={accessBlocked} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
        <summary className="cursor-pointer text-sm font-medium">
          {accessIssue?.title ?? (expired ? 'Подписка истекла. Продлите доступ' : 'Подписка и оплата')}
        </summary>
        <div className="mt-4 space-y-4">{children}</div>
      </details>
    </div>
  )
}
