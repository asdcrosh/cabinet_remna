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
        className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-400/20 dark:bg-cyan-400/[0.06]"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-cyan-700 shadow-sm dark:bg-white/[0.08] dark:text-cyan-200 dark:shadow-none">
            <MonitorSmartphone className="h-5 w-5" />
          </span>
          <div>
            <h2 id="add-device-guide-title" className="font-semibold text-slate-950 dark:text-white">Как подключить другое устройство</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              На новом устройстве откройте этот кабинет, войдите в аккаунт и перейдите в раздел «VPN». Там будут две кнопки: установить приложение и добавить VPN.
            </p>
          </div>
        </div>
        <p className="mt-2 pl-[3.25rem] text-xs leading-5 text-slate-500 dark:text-slate-400">
          После первого запуска VPN устройство появится в списке автоматически.
        </p>
      </section>
      <DevicesList />
    </div>
  )
}
