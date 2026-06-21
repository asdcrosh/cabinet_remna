'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { CheckCircle2, Eye, EyeOff, Mail } from 'lucide-react'

interface RegisterInput {
  email: string
  password: string
  name?: string
  agreeToTerms: boolean
}

export function RegisterForm() {
  const router = useRouter()
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } =
    useForm<RegisterInput>({
      defaultValues: { email: '', password: '', name: '', agreeToTerms: false as any },
    })
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)
  const [emailDelivery, setEmailDelivery] = useState<string | null>(null)
  const password = watch('password')

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      const result = await apiFetch<{ emailDelivery?: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(values),
      })
      setRegisteredEmail(values.email)
      setEmailDelivery(result.emailDelivery ?? null)
      toast('Проверьте почту для подтверждения email', 'success')
    } catch (e: any) {
      setServerError(e.message)
    }
  })

  if (registeredEmail) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
          <Mail className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Подтвердите email</h2>
          <p className="mt-1 text-sm text-slate-500">
            Мы отправили ссылку подтверждения на {registeredEmail}. После подтверждения можно войти в кабинет.
          </p>
        </div>
        {emailDelivery && emailDelivery !== 'sent' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            Доставка email не настроена. В dev-режиме ссылка подтверждения выведена в консоль сервера.
          </div>
        )}
        <button
          type="button"
          className="btn-primary w-full"
          onClick={() => router.push('/login')}
        >
          Перейти ко входу
        </button>
        <div className="flex items-center justify-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
          Аккаунт создан
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className="input"
          {...register('email', {
            required: 'Введите email',
            pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: 'Некорректный email' },
          })}
        />
        {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
      </div>
      <div>
        <label className="label" htmlFor="name">Имя <span className="text-slate-400">(необязательно)</span></label>
        <input id="name" type="text" className="input" {...register('name')} />
      </div>
      <div>
        <label className="label" htmlFor="password">Пароль</label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            className="input pr-11"
            {...register('password', {
              required: 'Введите пароль',
              minLength: { value: 8, message: 'Минимум 8 символов' },
              validate: (v) =>
                (/[A-Za-z]/.test(v) && /[0-9]/.test(v)) || 'Должна быть латиница и цифра',
            })}
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
        {errors.password && (
          <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>
        )}
        {password && (
          <StrengthIndicator value={password} />
        )}
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          className="mt-0.5"
          {...register('agreeToTerms', { required: true })}
        />
        <span>
          Согласен с{' '}
          <a href="/terms" className="text-brand-600 hover:underline">
            условиями использования
          </a>
        </span>
      </label>
      {errors.agreeToTerms && (
        <p className="text-xs text-red-600">Нужно согласиться с условиями</p>
      )}
      {serverError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
          {serverError}
        </div>
      )}
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? 'Создаём аккаунт...' : 'Зарегистрироваться'}
      </button>
    </form>
  )
}

function StrengthIndicator({ value }: { value: string }) {
  let score = 0
  if (value.length >= 8) score++
  if (/[A-Z]/.test(value)) score++
  if (/[a-z]/.test(value)) score++
  if (/[0-9]/.test(value)) score++
  if (/[^A-Za-z0-9]/.test(value)) score++
  const labels = ['', 'слабый', 'средний', 'нормальный', 'хороший', 'отличный']
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>Надёжность</span>
        <span>{labels[score] || '—'}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-surface-800">
        <div
          className="h-full rounded-full bg-brand-600 transition-all"
          style={{ width: `${Math.max(10, score * 20)}%` }}
        />
      </div>
    </div>
  )
}
