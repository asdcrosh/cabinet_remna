'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiFetch } from '@/lib/api-client'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/auth/validation'
import { FormAlert } from '@/components/ui/form-alert'

export function ForgotPasswordForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(values),
      })
      setSent(true)
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Не удалось отправить ссылку')
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {sent && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
          Если такой email зарегистрирован, ссылка для восстановления отправлена.
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className="input"
          {...register('email')}
        />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>
      {serverError && (
        <FormAlert>{serverError}</FormAlert>
      )}
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? 'Отправляем...' : 'Отправить ссылку'}
      </button>
    </form>
  )
}
