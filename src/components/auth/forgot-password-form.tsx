'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiFetch } from '@/lib/api-client'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/auth/validation'
import { FormAlert } from '@/components/ui/form-alert'
import { CheckCircle2, Mail, Send } from 'lucide-react'

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
        <div role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm leading-5 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Если такой email зарегистрирован, ссылка для восстановления отправлена.</span>
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="input pl-10"
            placeholder="name@example.com"
            {...register('email')}
          />
        </div>
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>
      {serverError && (
        <FormAlert>{serverError}</FormAlert>
      )}
      <button type="submit" disabled={isSubmitting} className="btn-primary min-h-12 w-full">
        <Send className="h-4 w-4" />
        {isSubmitting ? 'Отправляем...' : 'Отправить ссылку'}
      </button>
    </form>
  )
}
