// /dashboard/devices — список устройств. Тянем через наш API route,
// чтобы UI был полностью client-side и можно было легко добавить кнопку
// "отвязать" без перезагрузки.

import Link from 'next/link'
import { DevicesList } from '@/components/dashboard/devices-list'
import { PageHeader } from '@/components/dashboard/page-header'
import { PlugZap, ShieldCheck } from 'lucide-react'

export default function DevicesPage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Устройства"
        description="Просматривайте активные подключения и освобождайте места для новых устройств."
        action={
          <Link href="/dashboard/subscription" className="btn-primary w-full sm:w-auto">
            <PlugZap className="h-4 w-4" />
            Подключить устройство
          </Link>
        }
      />
      <section className="flex items-start gap-3 rounded-2xl border border-cyan-200/70 bg-cyan-50/70 px-4 py-3 text-sm text-cyan-950 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-100">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 text-cyan-700 shadow-sm dark:bg-white/10 dark:text-cyan-200">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div>
          <div className="font-semibold">Устройства добавляются автоматически</div>
          <p className="mt-0.5 text-xs leading-5 opacity-80 sm:text-sm">После первого запуска VPN подключение появится в списке.</p>
        </div>
      </section>
      <DevicesList />
    </div>
  )
}
