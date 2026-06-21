'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { Save } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'

interface ProfileFormInput {
  name: string
}

export function ProfileForm({ name }: { name: string | null }) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<ProfileFormInput>({
    defaultValues: { name: name ?? '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await apiFetch('/api/me', { method: 'PATCH', body: JSON.stringify({ name: values.name }) })
      toast('Профиль обновлён', 'success')
      router.refresh()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Не удалось обновить профиль')
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="profile-name">Имя</label>
        <input id="profile-name" className="input" placeholder="Как к вам обращаться" {...register('name')} />
      </div>
      {serverError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}
      <button className="btn-primary" disabled={isSubmitting}>
        <Save className="h-4 w-4" />
        {isSubmitting ? 'Сохраняем...' : 'Сохранить профиль'}
      </button>
    </form>
  )
}
