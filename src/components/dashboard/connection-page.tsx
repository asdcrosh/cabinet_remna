import type { ReactNode } from 'react'
import Link from 'next/link'
import { KeysCard } from './keys-card'
import { PageHeader } from './page-header'

export function ConnectionPage({ subscriptionUrl, happLink, supportEnabled, deviceLimit, expired, notice, children }: {
  subscriptionUrl: string
  happLink?: string | null
  supportEnabled: boolean
  deviceLimit?: number | null
  expired: boolean
  notice?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="user-workspace page-stack mx-auto w-full max-w-2xl">
      <PageHeader title="Подключение" description={expired ? 'Продлите доступ, чтобы пользоваться VPN.' : 'Настроим VPN на этом устройстве.'} />
      {!expired && (
        <>
          {notice}
          <KeysCard subscriptionUrl={subscriptionUrl} happLink={happLink} supportEnabled={supportEnabled} deviceLimit={deviceLimit} />
          <details className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
            <summary className="cursor-pointer text-sm font-medium">Как подключить другое устройство</summary>
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">Откройте этот кабинет на другом телефоне или компьютере и войдите в тот же аккаунт. В разделе «VPN» пройдите эти же три шага. Устройство появится в списке автоматически.</p>
          </details>
          <Link href="/dashboard/devices" className="py-2 text-sm text-slate-500 underline dark:text-slate-400">Мои устройства</Link>
        </>
      )}
      <details open={expired} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
        <summary className="cursor-pointer text-sm font-medium">
          {expired ? 'Подписка истекла. Продлите доступ' : 'Подписка и оплата'}
        </summary>
        <div className="mt-4 space-y-4">{children}</div>
      </details>
    </div>
  )
}
