import type { ReactNode } from 'react'
import Link from 'next/link'
import { MonitorSmartphone } from 'lucide-react'
import { DevicesList } from './devices-list'
import { KeysCard } from './keys-card'
import { PageHeader } from './page-header'
import { VpnConnectionCheck } from './vpn-connection-check'

type ConnectionPageProps = {
  subscriptionUrl: string
  happLink?: string | null
  supportEnabled: boolean
  deviceLimit?: number | null
  expired: boolean
  accessIssue?: { title: string; description: string } | null
  notice?: ReactNode
  children: ReactNode
  /** Новый дизайн: раздел «VPN» со статусом сверху, устройствами и ссылкой подключения. */
  newDesign?: boolean
}

export function ConnectionPage(props: ConnectionPageProps) {
  if (props.newDesign) return <ConnectionPageV2 {...props} />
  const { subscriptionUrl, happLink, supportEnabled, deviceLimit, expired, accessIssue, notice, children } = props
  const accessBlocked = expired || Boolean(accessIssue)
  return (
    <div className="user-workspace page-stack mx-auto w-full max-w-3xl">
      <PageHeader
        title="Подключение"
        description={accessIssue?.description ?? (expired ? 'Продлите доступ, чтобы пользоваться VPN.' : 'Установите приложение, добавьте подписку и включите VPN.')}
        action={<Link href="/dashboard/billing" className="btn-secondary w-full sm:w-auto">Подписка и оплата</Link>}
      />
      {!accessBlocked && (
        <>
          {notice}
          <KeysCard subscriptionUrl={subscriptionUrl} happLink={happLink} supportEnabled={supportEnabled} deviceLimit={deviceLimit} />
          <details className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.025]">
            <summary className="cursor-pointer py-1 text-sm font-semibold">VPN уже настроен на этом устройстве?</summary>
            <p className="mb-3 mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">Повторно добавлять подписку не нужно. Включите VPN в приложении, затем проверьте соединение.</p>
            <VpnConnectionCheck supportEnabled={supportEnabled} deviceLimit={deviceLimit} simple />
          </details>
          <details className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
            <summary className="cursor-pointer text-sm font-medium">Как подключить другое устройство</summary>
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">Откройте этот кабинет на другом телефоне или компьютере и войдите в тот же аккаунт. В разделе «VPN» пройдите эти же три шага. Устройство появится в списке автоматически.</p>
          </details>
          <Link href="/dashboard/devices" className="py-2 text-sm text-slate-500 underline dark:text-slate-400">Мои устройства</Link>
        </>
      )}
      <details open={accessBlocked} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
        <summary className="cursor-pointer text-sm font-medium">
          {accessIssue?.title ?? (expired ? 'Подписка истекла. Продлите доступ' : 'Срок доступа и трафик')}
        </summary>
        <div className="mt-4 space-y-4">{children}</div>
      </details>
    </div>
  )
}

function ConnectionPageV2({ subscriptionUrl, happLink, supportEnabled, deviceLimit, expired, accessIssue, notice, children }: ConnectionPageProps) {
  const accessBlocked = expired || Boolean(accessIssue)
  return (
    <div className="user-workspace page-stack mx-auto w-full max-w-3xl" data-design="v2">
      <PageHeader
        title="VPN"
        description={accessIssue?.description ?? (expired ? 'Продлите подписку, чтобы снова пользоваться VPN.' : 'Подключите устройство за три шага: установить, добавить, включить.')}
        action={<Link href="/dashboard/billing" className="btn-secondary w-full sm:w-auto">Подписка</Link>}
      />
      {children}
      {notice}
      {!accessBlocked ? (
        <KeysCard subscriptionUrl={subscriptionUrl} happLink={happLink} supportEnabled={supportEnabled} deviceLimit={deviceLimit} linkTools />
      ) : null}
      <section id="devices" aria-labelledby="devices-title" className="scroll-mt-24 space-y-3">
        <div className="flex items-start gap-3 px-1">
          <MonitorSmartphone className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <div>
            <h2 id="devices-title" className="text-base font-semibold text-slate-950 dark:text-white">Устройства</h2>
            <p className="mt-0.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Чтобы подключить ещё одно, откройте этот кабинет на нём и пройдите три шага выше. После первого запуска VPN устройство появится здесь.
            </p>
          </div>
        </div>
        <DevicesList deviceLimit={deviceLimit} />
      </section>
      {!accessBlocked ? (
        <details className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.025]">
          <summary className="cursor-pointer py-1 text-sm font-semibold">Не работает? Проверить соединение</summary>
          <p className="mb-3 mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">Включите VPN в приложении и запустите проверку. Если не поможет — напишите нам, тема обращения уже будет выбрана.</p>
          <VpnConnectionCheck supportEnabled={supportEnabled} deviceLimit={deviceLimit} simple />
          {supportEnabled ? (
            <Link href="/dashboard/support?category=connection" className="btn-secondary mt-3 w-full justify-center sm:w-auto">Написать в Помощь</Link>
          ) : null}
        </details>
      ) : null}
    </div>
  )
}
