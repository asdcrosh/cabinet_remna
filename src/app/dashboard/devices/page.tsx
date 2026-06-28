// /dashboard/devices — список устройств. Тянем через наш API route,
// чтобы UI был полностью client-side и можно было легко добавить кнопку
// "отвязать" без перезагрузки.

import { DevicesList } from '@/components/dashboard/devices-list'
import { PageHeader } from '@/components/dashboard/page-header'
import { Clock3, RefreshCw, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'

export default function DevicesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Устройства"
        description="Список подключенных устройств и управление доступом"
      />
      <section className="grid gap-2 md:grid-cols-3">
        <DeviceHint
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Привязка автоматическая"
          text="Появляется после подключения"
        />
        <DeviceHint
          icon={<RefreshCw className="h-5 w-5" />}
          title="Можно отвязать"
          text="Если сменили устройство"
        />
        <DeviceHint
          icon={<Clock3 className="h-5 w-5" />}
          title="Активность"
          text="Видно последнее подключение"
        />
      </section>
      <DevicesList />
    </div>
  )
}

function DeviceHint({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 dark:bg-white dark:text-slate-950">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="truncate text-xs text-slate-500">{text}</p>
        </div>
      </div>
    </div>
  )
}
