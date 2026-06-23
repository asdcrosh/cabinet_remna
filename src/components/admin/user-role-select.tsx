'use client'

import { useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'

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
  const [loading, setLoading] = useState(false)
  const canManage =
    actorId !== userId &&
    (actorRole === 'SUPER_ADMIN' || (!['ADMIN', 'SUPER_ADMIN'].includes(role) && actorRole === 'ADMIN'))
  const roles: UserRole[] =
    actorRole === 'SUPER_ADMIN'
      ? ['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN']
      : ['USER', 'MODERATOR']

  return (
    <select
      className="input h-9 min-w-[9.5rem] py-1.5 text-xs"
      value={value}
      disabled={!canManage || loading}
      aria-label="Роль пользователя"
      onChange={async (event) => {
        const nextRole = event.target.value as UserRole
        const previousRole = value
        setValue(nextRole)
        setLoading(true)
        try {
          await apiFetch(`/api/admin/users/${userId}/role`, {
            method: 'PATCH',
            body: JSON.stringify({ role: nextRole }),
          })
          toast(`Роль: ${labels[nextRole]}`, 'success')
        } catch {
          setValue(previousRole)
        } finally {
          setLoading(false)
        }
      }}
    >
      {roles.map((item) => (
        <option key={item} value={item}>{labels[item]}</option>
      ))}
      {!roles.includes(value) && <option value={value}>{labels[value]}</option>}
    </select>
  )
}
