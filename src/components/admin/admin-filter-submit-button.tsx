'use client'

import { useFormStatus } from 'react-dom'

export function AdminFilterSubmitButton({
  idleText = 'Показать',
  pendingText = 'Загрузка...',
}: {
  idleText?: string
  pendingText?: string
}) {
  const { pending } = useFormStatus()

  return (
    <button className="btn-primary" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? pendingText : idleText}
    </button>
  )
}
