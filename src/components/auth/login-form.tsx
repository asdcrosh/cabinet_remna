'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { CheckCircle2, Eye, EyeOff, RefreshCw } from 'lucide-react'

interface LoginInput {
  email: string
  password: string
}

export function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get('next') || '/dashboard'
  const verified = search.get('verified')
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    defaultValues: { email: '', password: '' },
  })
  const [serverError, setServerError] = useState<string | null>(null)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resending, setResending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const email = watch('email')

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    setNeedsVerification(false)
    try {
      await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(values) })
      toast('Добро пожаловать!', 'success')
      router.push(next)
      router.refresh()
    } catch (e: any) {
      if (e.data?.code === 'EMAIL_NOT_VERIFIED') {
        setNeedsVerification(true)
      }
      setServerError(e.message)
    }
  })

  async function resendVerification() {
    if (!email) {
      setServerError('Введите email, чтобы отправить ссылку повторно')
      return
    }
    setResending(true)
    try {
      const result = await apiFetch<{ emailDelivery?: string }>('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      if (result.emailDelivery && result.emailDelivery !== 'sent') {
        toast('Ссылка создана. В dev-режиме она выведена в консоль сервера.', 'success')
      } else {
        toast('Ссылка подтверждения отправлена', 'success')
      }
    } catch {
      // apiFetch уже покажет toast
    } finally {
      setResending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {verified === '1' && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          Email подтверждён. Теперь можно войти.
        </div>
      )}
      {(verified === 'invalid' || verified === 'missing') && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          Ссылка подтверждения недействительна или истекла. Запросите новую ссылку.
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className="input"
          {...register('email', { required: 'Введите email' })}
        />
        {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
      </div>
      <div>
        <label className="label" htmlFor="password">Пароль</label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            className="input pr-11"
            {...register('password', { required: 'Введите пароль' })}
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:text-slate-700"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
      </div>
      {serverError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
          {serverError}
        </div>
      )}
      {needsVerification && (
        <button
          type="button"
          className="btn-secondary w-full"
          disabled={resending}
          onClick={resendVerification}
        >
          <RefreshCw className={resending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          {resending ? 'Отправляем...' : 'Отправить ссылку повторно'}
        </button>
      )}
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? 'Входим...' : 'Войти'}
      </button>
    </form>
  )
}
