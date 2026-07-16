// /dashboard/devices — список устройств. Тянем через наш API route,
// чтобы UI был полностью client-side и можно было легко добавить кнопку
// "отвязать" без перезагрузки.

import Link from 'next/link'
import { DevicesList } from '@/components/dashboard/devices-list'
import { PageHeader } from '@/components/dashboard/page-header'
import { PlugZap } from 'lucide-react'

export default function DevicesPage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Устройства"
        description="Устройства появляются после первого подключения VPN"
        action={
          <Link href="/dashboard/subscription" className="btn-primary w-full sm:w-auto">
            <PlugZap className="h-4 w-4" />
            Подключить устройство
          </Link>
        }
      />
      <DevicesList />
    </div>
  )
}
