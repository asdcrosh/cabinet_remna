'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings2 } from 'lucide-react'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { AdminModal } from '@/components/admin/admin-modal'
import { SupportSettingsPanel } from '@/components/admin/support-settings-panel'
import { SupportPanelDynamic } from '@/components/support/support-panel-dynamic'
import type { SupportPanelProps } from '@/components/support/support-panel-model'
import type { SupportSettings } from '@/lib/support-settings'
import { toast } from '@/components/ui/toaster'

/**
 * «Поддержка» в новом дизайне: шаблоны ответов и SLA настраиваются прямо здесь —
 * кнопкой в шапке и шестерёнкой в списке шаблонов. Кнопки видны только тем,
 * кто может менять настройки (ADMIN, SUPER_ADMIN); сервер проверяет то же самое.
 */
export function AdminSupportView({
  panelProps,
  supportSettings,
  canEditSettings,
  initialSettingsOpen = false,
}: {
  panelProps: Omit<SupportPanelProps, 'onEditQuickReplies'>
  supportSettings: SupportSettings
  canEditSettings: boolean
  initialSettingsOpen?: boolean
}) {
  const router = useRouter()
  const [settingsOpen, setSettingsOpen] = useState(canEditSettings && initialSettingsOpen)
  const openSettings = canEditSettings ? () => setSettingsOpen(true) : undefined

  // ?settings=1 нужен только для перехода из «Системы»: после закрытия окно не должно всплывать снова.
  useEffect(() => {
    if (!initialSettingsOpen) return
    const next = new URLSearchParams(window.location.search)
    if (!next.has('settings')) return
    next.delete('settings')
    window.history.replaceState(null, '', next.toString() ? `${window.location.pathname}?${next.toString()}` : window.location.pathname)
  }, [initialSettingsOpen])

  return (
    <AdminPageShell
      title="Поддержка"
      description="Очередь обращений и переписка с пользователями"
      variant="plain"
      action={openSettings ? (
        <button type="button" className="btn-secondary" onClick={openSettings}>
          <Settings2 className="h-4 w-4" />
          Шаблоны и SLA
        </button>
      ) : undefined}
    >
      <SupportPanelDynamic {...panelProps} onEditQuickReplies={openSettings} />
      {canEditSettings ? (
        <AdminModal
          open={settingsOpen}
          title="Шаблоны ответов и SLA"
          description="Пороги ожидания ответа и готовые фразы операторов"
          onClose={() => setSettingsOpen(false)}
          size="xl"
        >
          <SupportSettingsPanel
            initialSettings={supportSettings}
            embedded
            onSaved={() => {
              toast('Шаблоны и SLA сохранены', 'success')
              setSettingsOpen(false)
              router.refresh()
            }}
          />
        </AdminModal>
      ) : null}
    </AdminPageShell>
  )
}
