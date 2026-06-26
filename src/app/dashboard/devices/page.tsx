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
      <section className="grid gap-3 md:grid-cols-3">
        <DeviceHint
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Привязка автоматическая"
          text="Устройство появляется после первого подключения к VPN."
        />
        <DeviceHint
          icon={<RefreshCw className="h-5 w-5" />}
          title="Можно отвязать"
          text="Освободите место, если сменили телефон или компьютер."
        />
        <DeviceHint
          icon={<Clock3 className="h-5 w-5" />}
          title="Активность"
          text="Последнее подключение помогает понять, что реально используется."
        />
      </section>
      <DevicesList />
    </div>
  )
}

function DeviceHint({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="card flex items-start gap-3 p-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 dark:bg-white dark:text-slate-950">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
      </div>
    </div>
  )
}
