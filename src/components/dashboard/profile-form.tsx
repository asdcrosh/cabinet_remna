'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { updateProfileSchema, type UpdateProfileInput } from '@/lib/auth/validation'
import { toast } from '@/components/ui/toaster'

export function ProfileForm({ name }: { name: string | null }) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
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
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="min-w-0">
        <label className="label" htmlFor="profile-name">Имя</label>
        <input id="profile-name" className="input" placeholder="Как к вам обращаться" {...register('name')} />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      {serverError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100 sm:col-span-2">
          {serverError}
        </div>
      )}
      <button type="submit" className="btn-primary w-full sm:min-w-48" disabled={isSubmitting}>
        <Save className="h-4 w-4" />
        {isSubmitting ? 'Сохраняем...' : 'Сохранить профиль'}
      </button>
    </form>
  )
}
