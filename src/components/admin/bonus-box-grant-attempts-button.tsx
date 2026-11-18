'use client'

import { useState } from 'react'
import { Gift } from 'lucide-react'
import { AdminModal } from '@/components/admin/admin-modal'
import { BonusBoxAttemptGrantPanel } from '@/components/admin/bonus-box-attempt-grant-panel'

/**
 * Массовое начисление попыток рулетки из шапки раздела «Бонусы» (новый дизайн).
 * Раньше кнопка пряталась внутри свёрнутого блока «Настройки рулетки».
 * Показывается только главному администратору — как и раньше; API проверяет то же самое.
 */
export function BonusBoxGrantAttemptsButton({ eligibleUsersCount }: { eligibleUsersCount: number }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        <Gift className="h-4 w-4" />
        Начислить попытки
      </button>
      <AdminModal
        open={open}
        title="Начислить попытки"
        description="Всем пользователям или выбранным вручную"
        onClose={() => setOpen(false)}
        size="xl"
      >
        <BonusBoxAttemptGrantPanel
          eligibleUsersCount={eligibleUsersCount}
          embedded
          onGranted={() => setOpen(false)}
        />
      </AdminModal>
    </>
  )
}
