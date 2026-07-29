'use client'

import { useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

type UserRole = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'

const labels: Record<UserRole, string> = {
  USER: 'Пользователь',
  MODERATOR: 'Модератор',
  ADMIN: 'Администратор',
  SUPER_ADMIN: 'Главный админ',
}

export function UserRoleSelect({
  userId,
  role,
  actorId,
  actorRole,
}: {
  userId: string
  role: UserRole
  actorId: string
  actorRole: UserRole
}) {
  const [value, setValue] = useState(role)
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(false)
  const canManage =
    actorId !== userId &&
    (actorRole === 'SUPER_ADMIN' || (!['ADMIN', 'SUPER_ADMIN'].includes(role) && actorRole === 'ADMIN'))
  const roles: UserRole[] =
    actorRole === 'SUPER_ADMIN'
      ? ['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN']
      : ['USER', 'MODERATOR']

  async function applyRole() {
    if (!pendingRole) return
    setLoading(true)
    try {
      await apiFetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: pendingRole }),
      })
      setValue(pendingRole)
      toast(`Роль: ${labels[pendingRole]}`, 'success')
      setPendingRole(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <select
        className="input h-10 min-h-10 min-w-[9.5rem] py-1.5 text-xs"
        value={pendingRole ?? value}
        disabled={!canManage || loading}
        aria-label="Роль пользователя"
        onChange={(event) => setPendingRole(event.target.value as UserRole)}
      >
        {roles.map((item) => (
          <option key={item} value={item}>{labels[item]}</option>
        ))}
        {!roles.includes(value) && <option value={value}>{labels[value]}</option>}
      </select>
      <ConfirmDialog
        open={Boolean(pendingRole)}
        title="Изменить роль пользователя?"
        description={`Роль изменится с «${labels[value]}» на «${pendingRole ? labels[pendingRole] : ''}».`}
        confirmLabel="Изменить роль"
        loading={loading}
        tone="warning"
        details="Права доступа изменятся сразу после сохранения."
        onCancel={() => setPendingRole(null)}
        onConfirm={() => void applyRole()}
      />
    </>
  )
}
