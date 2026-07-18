'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiFetch } from '@/lib/api-client'
import { loginSchema, type LoginInput } from '@/lib/auth/validation'
import { toast } from '@/components/ui/toaster'
import { FormAlert } from '@/components/ui/form-alert'
import { CheckCircle2, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { YandexAuthButton } from './yandex-auth-button'
import { sanitizeInternalNext } from '@/lib/auth/next-path'

export function LoginForm({ yandexEnabled = false }: { yandexEnabled?: boolean }) {
  const router = useRouter()
  const search = useSearchParams()
  const next = sanitizeInternalNext(search.get('next'))
  const verified = search.get('verified')
  const yandexError = search.get('yandex_error')
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
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
    } catch (error) {
      const apiError = error as Error & { data?: { code?: string } }
      if (apiError.data?.code === 'EMAIL_NOT_VERIFIED') {
        setNeedsVerification(true)
      }
      setServerError(apiError.message || 'Не удалось войти')
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
      {yandexEnabled && (
        <>
          <YandexAuthButton next={next} />
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            или email
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>
        </>
      )}
      {verified === '1' && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          Email подтверждён. Теперь можно войти.
        </div>
      )}
      {(verified === 'invalid' || verified === 'missing') && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          Ссылка подтверждения недействительна или истекла. Запросите новую ссылку.
        </div>
      )}
      {yandexError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {yandexErrorMessage(yandexError)}
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
        {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between gap-3">
          <label className="label mb-0" htmlFor="password">Пароль</label>
          <Link href="/forgot-password" className="text-xs font-medium text-brand-600 hover:underline">
            Забыли пароль?
          </Link>
        </div>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            className="input pr-11"
            {...register('password')}
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-100"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
      </div>
      {serverError && (
        <FormAlert>{serverError}</FormAlert>
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

function yandexErrorMessage(code: string) {
  const messages: Record<string, string> = {
    not_configured: 'Вход через Яндекс пока не настроен.',
    invalid_state: 'Сессия входа через Яндекс истекла. Попробуйте ещё раз.',
    access_denied: 'Вход через Яндекс отменён.',
    legal_required: 'Для регистрации через Яндекс подтвердите документы на странице регистрации.',
  }
  return messages[code] ?? 'Не удалось войти через Яндекс. Попробуйте ещё раз.'
}
