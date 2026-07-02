// /dashboard/devices — список устройств. Тянем через наш API route,
// чтобы UI был полностью client-side и можно было легко добавить кнопку
// "отвязать" без перезагрузки.

import Link from 'next/link'
import { DevicesList } from '@/components/dashboard/devices-list'
import { PageHeader } from '@/components/dashboard/page-header'
import { Clock3, PlugZap, RefreshCw, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'

export default function DevicesPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Устройства"
        description="Подключения и доступ"
        action={
          <Link href="/dashboard/subscription" className="btn-secondary w-full sm:w-auto">
            <PlugZap className="h-4 w-4" />
            Подключить
          </Link>
        }
      />
      <section className="rounded-lg border border-cyan-200/70 bg-cyan-50/70 p-3 text-sm text-cyan-900 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-100 sm:hidden">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-4 w-4" />
          Устройства добавляются автоматически
        </div>
        <p className="mt-1 text-xs leading-5 opacity-80">Откройте подписку в приложении, и подключение появится в списке.</p>
      </section>
      <section className="hidden gap-3 sm:grid md:grid-cols-3">
        <DeviceHint
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Автоматическая привязка"
          text="Появляется после первого запуска VPN"
        />
        <DeviceHint
          icon={<RefreshCw className="h-5 w-5" />}
          title="Быстрое управление"
          text="Можно освободить место одним действием"
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
    <div className="rounded-lg border border-slate-200/80 bg-white/85 p-3 shadow-sm shadow-slate-200/50 backdrop-blur transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-white dark:border-white/10 dark:bg-white/[0.035] dark:shadow-black/20 dark:hover:border-cyan-500/30 dark:hover:bg-white/[0.055]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 dark:bg-cyan-300/10 dark:text-cyan-200">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-950 dark:text-white">{title}</h2>
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{text}</p>
        </div>
      </div>
    </div>
  )
}
