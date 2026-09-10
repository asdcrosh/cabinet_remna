'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Check, Eye, EyeOff, KeyRound, LockKeyhole } from 'lucide-react'
import { apiFetch, isApiFetchError } from '@/lib/api-client'
import { resetPasswordSchema } from '@/lib/auth/validation'
import { FormAlert } from '@/components/ui/form-alert'

const resetFormSchema = resetPasswordSchema
  .extend({ confirmPassword: z.string().min(1, 'Повторите новый пароль') })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Пароли не совпадают',
  })

type ResetFormInput = z.infer<typeof resetFormSchema>

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<ResetFormInput>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [invalidLink, setInvalidLink] = useState(false)
  const password = watch('password')

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    setInvalidLink(false)
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: values.token, password: values.password }),
      })
      window.sessionStorage.removeItem('password-reset-email:v1')
      window.sessionStorage.removeItem('password-reset-resend-until:v1')
      router.push('/login?reset=success')
    } catch (error) {
      if (isApiFetchError(error) && error.status === 400) setInvalidLink(true)
      setServerError(error instanceof Error ? error.message : 'Не удалось сохранить пароль')
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">Новый пароль</label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            className="input px-10"
            placeholder="Придумайте новый пароль"
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
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
      </div>
      <ul className="grid gap-1.5 text-xs text-slate-500 dark:text-slate-400" aria-label="Требования к паролю">
        <PasswordRequirement met={password.length >= 8} label="Минимум 8 символов" />
        <PasswordRequirement met={/[A-Za-z]/.test(password)} label="Латинская буква" />
        <PasswordRequirement met={/[0-9]/.test(password)} label="Цифра" />
      </ul>
      <div>
        <label className="label" htmlFor="confirmPassword">Повторите пароль</label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="confirmPassword"
            type={showConfirmation ? 'text' : 'password'}
            autoComplete="new-password"
            className="input px-10"
            placeholder="Повторите новый пароль"
            {...register('confirmPassword')}
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-100"
            onClick={() => setShowConfirmation((value) => !value)}
            aria-label={showConfirmation ? 'Скрыть повтор пароля' : 'Показать повтор пароля'}
          >
            {showConfirmation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>}
      </div>
      {serverError && (
        <FormAlert>{serverError}</FormAlert>
      )}
      {invalidLink && (
        <Link href="/forgot-password" className="btn-secondary min-h-12 w-full">
          Запросить новую ссылку
        </Link>
      )}
      <button type="submit" disabled={isSubmitting || invalidLink} className="btn-primary min-h-12 w-full">
        <KeyRound className="h-4 w-4" />
        {isSubmitting ? 'Сохраняем...' : 'Сохранить пароль'}
      </button>
    </form>
  )
}

function PasswordRequirement({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={met ? 'flex items-center gap-2 text-emerald-600 dark:text-emerald-300' : 'flex items-center gap-2'}>
      <span className={met ? 'grid h-4 w-4 place-items-center rounded-full bg-emerald-100 dark:bg-emerald-500/15' : 'h-4 w-4 rounded-full border border-current opacity-50'}>
        {met && <Check className="h-3 w-3" />}
      </span>
      {label}
    </li>
  )
}
