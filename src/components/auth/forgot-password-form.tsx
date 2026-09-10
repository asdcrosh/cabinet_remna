'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiFetch, isApiFetchError } from '@/lib/api-client'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/auth/validation'
import { FormAlert } from '@/components/ui/form-alert'
import { ArrowLeft, CheckCircle2, Mail, RefreshCw, Send } from 'lucide-react'

const RESEND_DELAY_MS = 60_000
const RESEND_UNTIL_KEY = 'password-reset-resend-until:v1'
const SENT_EMAIL_KEY = 'password-reset-email:v1'

export function ForgotPasswordForm() {
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [sentEmail, setSentEmail] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [resendUntil, setResendUntil] = useState(0)
  const [cooldownReady, setCooldownReady] = useState(false)

  useEffect(() => {
    const storedEmail = window.sessionStorage.getItem(SENT_EMAIL_KEY)?.trim() ?? ''
    const storedUntil = Number(window.sessionStorage.getItem(RESEND_UNTIL_KEY) ?? 0)
    if (storedEmail) {
      setValue('email', storedEmail)
      setSentEmail(storedEmail)
      setSent(true)
    }
    if (Number.isFinite(storedUntil) && storedUntil > Date.now()) {
      setResendUntil(storedUntil)
      setResendIn(Math.ceil((storedUntil - Date.now()) / 1000))
    }
    setCooldownReady(true)
  }, [setValue])

  useEffect(() => {
    if (resendUntil <= Date.now()) return
    const updateCountdown = () => {
      setResendIn(Math.max(0, Math.ceil((resendUntil - Date.now()) / 1000)))
    }
    updateCountdown()
    const timer = window.setInterval(() => {
      updateCountdown()
    }, 250)
    return () => window.clearInterval(timer)
  }, [resendUntil])

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(values),
      })
      const nextResendAt = Date.now() + RESEND_DELAY_MS
      window.sessionStorage.setItem(SENT_EMAIL_KEY, values.email)
      window.sessionStorage.setItem(RESEND_UNTIL_KEY, String(nextResendAt))
      setSentEmail(values.email)
      setSent(true)
      setResendUntil(nextResendAt)
      setResendIn(Math.ceil(RESEND_DELAY_MS / 1000))
    } catch (error) {
      if (isApiFetchError(error) && error.status === 429 && error.retryAfter) {
        const nextResendAt = Date.now() + error.retryAfter * 1000
        window.sessionStorage.setItem(RESEND_UNTIL_KEY, String(nextResendAt))
        setResendUntil(nextResendAt)
        setResendIn(error.retryAfter)
      }
      setServerError(error instanceof Error ? error.message : 'Не удалось отправить ссылку')
    }
  })

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-200">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Проверьте почту</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Если аккаунт существует, ссылка отправлена на{' '}
            <span className="break-all font-medium text-slate-700 dark:text-slate-200">{sentEmail}</span>.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs leading-5 text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
          Письмо может прийти в течение нескольких минут. Проверьте папку «Спам», если его нет во входящих.
        </div>
        {serverError && <FormAlert>{serverError}</FormAlert>}
        <button
          type="button"
          disabled={!cooldownReady || isSubmitting || resendIn > 0}
          className="btn-primary w-full"
          onClick={() => void onSubmit()}
        >
          <RefreshCw className={isSubmitting ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          {isSubmitting
            ? 'Отправляем...'
            : resendIn > 0
              ? `Отправить ещё раз через ${resendIn} сек.`
              : 'Отправить ещё раз'}
        </button>
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => {
            window.sessionStorage.removeItem(SENT_EMAIL_KEY)
            window.sessionStorage.removeItem(RESEND_UNTIL_KEY)
            setSent(false)
            setServerError(null)
            setResendIn(0)
            setResendUntil(0)
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          Изменить email
        </button>
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
          Нет доступа к почте?{' '}
          <Link href="/contacts" className="font-medium text-brand-600 hover:underline">
            Обратитесь в поддержку
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
      <button type="submit" disabled={!cooldownReady || isSubmitting || resendIn > 0} className="btn-primary min-h-12 w-full">
        <Send className="h-4 w-4" />
        {isSubmitting
          ? 'Отправляем...'
          : resendIn > 0
            ? `Повторить через ${resendIn} сек.`
            : 'Отправить ссылку'}
      </button>
    </form>
  )
}
