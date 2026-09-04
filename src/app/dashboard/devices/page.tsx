import { DevicesList } from '@/components/dashboard/devices-list'
import { PageHeader } from '@/components/dashboard/page-header'
import { MonitorSmartphone } from 'lucide-react'

export default function DevicesPage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Устройства"
        description="Здесь отображаются устройства, на которых уже запускали VPN."
      />
      <section
        id="add-device-guide"
        aria-labelledby="add-device-guide-title"
        className="rounded-3xl border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-400/20 dark:bg-cyan-400/[0.06] sm:p-5"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-cyan-700 shadow-sm dark:bg-white/[0.08] dark:text-cyan-200 dark:shadow-none">
            <MonitorSmartphone className="h-5 w-5" />
          </span>
          <div>
            <h2 id="add-device-guide-title" className="font-semibold text-slate-950 dark:text-white">Как подключить другое устройство</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Добавлять его вручную не нужно. Выполните эти шаги именно на новом устройстве.
            </p>
          </div>
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Подключение другого устройства">
          <GuideStep number="1">Откройте этот сайт и войдите в свой аккаунт.</GuideStep>
          <GuideStep number="2">Перейдите в раздел «Подписка».</GuideStep>
          <GuideStep number="3">Установите предложенное приложение, добавьте VPN и включите его.</GuideStep>
        </ol>
        <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
          После первого запуска VPN устройство появится в списке автоматически.
        </p>
      </section>
      <DevicesList />
    </div>
  )
}

function GuideStep({ number, children }: { number: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 rounded-xl bg-white/80 p-3 text-sm leading-5 text-slate-700 dark:bg-white/[0.05] dark:text-slate-200">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-800 dark:bg-cyan-400/15 dark:text-cyan-200">
        {number}
      </span>
      <span>{children}</span>
    </li>
  )
}
