// /dashboard/devices — список устройств. Тянем через наш API route,
// чтобы UI был полностью client-side и можно было легко добавить кнопку
// "отвязать" без перезагрузки.

import { DevicesList } from '@/components/dashboard/devices-list'
import { PageHeader } from '@/components/dashboard/page-header'

export default function DevicesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Устройства"
        description="Список подключенных устройств и управление доступом"
      />
      <DevicesList />
    </div>
  )
}
