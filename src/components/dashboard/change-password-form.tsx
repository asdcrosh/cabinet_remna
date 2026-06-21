'use client'

import { useState } from 'react'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { Eye, EyeOff } from 'lucide-react'

interface ChangePasswordInput {
  oldPassword: string
  newPassword: string
  confirm: string
}

export function ChangePasswordForm() {
  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } =
    useForm<ChangePasswordInput>({
      defaultValues: { oldPassword: '', newPassword: '', confirm: '' },
    })
  const [serverError, setServerError] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const newPassword = watch('newPassword')

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await apiFetch('/api/me/password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword: values.oldPassword, newPassword: values.newPassword }),
      })
      toast('Пароль изменён', 'success')
      reset()
    } catch (e: any) {
      setServerError(e.message)
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="oldPassword">Текущий пароль</label>
        <PasswordField
          id="oldPassword"
          autoComplete="current-password"
          visible={visible}
          toggle={() => setVisible((value) => !value)}
          register={register('oldPassword', { required: 'Введите текущий пароль' })}
        />
        {errors.oldPassword && (
          <p className="text-xs text-red-600 mt-1">{errors.oldPassword.message}</p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="newPassword">Новый пароль</label>
        <PasswordField
          id="newPassword"
          autoComplete="new-password"
          visible={visible}
          toggle={() => setVisible((value) => !value)}
          register={register('newPassword', {
            required: 'Введите новый пароль',
            minLength: { value: 8, message: 'Минимум 8 символов' },
            validate: (v) =>
              (/[A-Za-z]/.test(v) && /[0-9]/.test(v)) || 'Должна быть латиница и цифра',
          })}
        />
        {errors.newPassword && (
          <p className="text-xs text-red-600 mt-1">{errors.newPassword.message}</p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="confirm">Подтверждение</label>
        <PasswordField
          id="confirm"
          autoComplete="new-password"
          visible={visible}
          toggle={() => setVisible((value) => !value)}
          register={register('confirm', {
            required: 'Подтвердите пароль',
            validate: (v) => v === newPassword || 'Пароли не совпадают',
          })}
        />
        {errors.confirm && (
          <p className="text-xs text-red-600 mt-1">{errors.confirm.message}</p>
        )}
      </div>
      {serverError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
          {serverError}
        </div>
      )}
      <button type="submit" disabled={isSubmitting} className="btn-primary">
        {isSubmitting ? 'Сохраняем...' : 'Сменить пароль'}
      </button>
    </form>
  )
}

function PasswordField({
  id,
  autoComplete,
  visible,
  toggle,
  register,
}: {
  id: string
  autoComplete: string
  visible: boolean
  toggle: () => void
  register: UseFormRegisterReturn
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        className="input pr-11"
        {...register}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:text-slate-700"
        onClick={toggle}
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}
