import { DevicesList } from '@/components/dashboard/devices-list'
import { PageHeader } from '@/components/dashboard/page-header'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { KeyRound, MonitorSmartphone } from 'lucide-react'
import { getFeatureFlags } from '@/lib/feature-flags'
import { getCurrentUser } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function DevicesPage() {
  // В новом дизайне устройства живут в разделе «VPN». Старые ссылки из уведомлений ведут туда же.
  if ((await getFeatureFlags()).newDesign) redirect('/dashboard/subscription#devices')
  const session = await getCurrentUser()
  if (!session) redirect('/login?next=/dashboard/devices')
  const subscription = await prisma.subscription.findFirst({
    where: { userId: session.uid },
    orderBy: { expireAt: 'desc' },
    select: { deviceLimit: true, plan: { select: { deviceLimit: true, unlimitedDevices: true } } },
  })
  // Без лимита список не мог предупредить о превышении: передаём его так же, как раздел «Подключение».
  const deviceLimit = subscription?.plan?.unlimitedDevices
    ? null
    : subscription?.deviceLimit ?? subscription?.plan?.deviceLimit ?? null
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
      <details className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <summary className="cursor-pointer text-sm font-medium text-slate-900 dark:text-white">Смена ссылки доступа</summary>
        <div className="mt-4">
          <div className="flex gap-3 rounded-xl bg-slate-50 p-3 dark:bg-white/[0.035]">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-300" />
            <div>
              <h3 className="text-sm font-semibold">Сменить ссылку доступа</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Старая ссылка перестанет работать на всех устройствах. Новую ссылку потребуется добавить в каждое приложение.</p>
            </div>
          </div>
        </div>
        <Link href="/dashboard/subscription" className="btn-secondary mt-3 w-full justify-center sm:w-auto">Управлять ссылкой</Link>
      </details>
      <DevicesList deviceLimit={deviceLimit} />
    </div>
  )
}
