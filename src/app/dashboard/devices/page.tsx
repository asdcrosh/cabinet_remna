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
        description="Проверяйте активность и удаляйте устройства, которыми больше не пользуетесь."
        action={
          <Link href="/dashboard/subscription#connection" className="btn-primary w-full sm:w-auto">
            <PlugZap className="h-4 w-4" />
            Новое подключение
          </Link>
        }
      />
      <DevicesList />
    </div>
  )
}
