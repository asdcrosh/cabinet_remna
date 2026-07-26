'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Save } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { updateProfileSchema, type UpdateProfileInput } from '@/lib/auth/validation'
import { toast } from '@/components/ui/toaster'
import { FormAlert } from '@/components/ui/form-alert'

export function ProfileForm({ name }: { name: string | null }) {
  const router = useRouter()
  const [isHydrated, setIsHydrated] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, reset, formState: { errors, isDirty, isSubmitting } } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: name ?? '' },
  })

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await apiFetch('/api/me', { method: 'PATCH', body: JSON.stringify({ name: values.name }) })
      reset({ name: values.name })
      toast('Профиль обновлён', 'success')
      router.refresh()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Не удалось обновить профиль')
    }
  })

  return (
    <form onSubmit={onSubmit}>
      <label className="label" htmlFor="profile-name">Отображаемое имя</label>
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          id="profile-name"
          className="input min-h-11"
          placeholder="Как к вам обращаться"
          disabled={!isHydrated || isSubmitting}
          {...register('name')}
        />
        <button
          type="submit"
          className={isDirty ? 'btn-primary min-h-11 w-full justify-center sm:min-w-36' : 'btn-secondary min-h-11 w-full justify-center sm:min-w-36'}
          disabled={!isHydrated || !isDirty || isSubmitting}
        >
          {isDirty ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {isSubmitting ? 'Сохраняем...' : isDirty ? 'Сохранить' : 'Сохранено'}
        </button>
      </div>
      {!errors.name && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Используется в кабинете и уведомлениях.</p>}
      {errors.name && <p className="mt-1.5 text-xs text-red-600">{errors.name.message}</p>}
      {serverError && (
        <FormAlert className="mt-2">{serverError}</FormAlert>
      )}
    </form>
  )
}
