'use client'

import { useState } from 'react'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { apiFetch } from '@/lib/api-client'
import { newPasswordSchema } from '@/lib/auth/validation'
import { toast } from '@/components/ui/toaster'
import { Eye, EyeOff } from 'lucide-react'
import { FormAlert } from '@/components/ui/form-alert'

const changePasswordFormSchema = z
  .object({
    oldPassword: z.string().min(1, 'Введите текущий пароль').max(128, 'Максимум 128 символов'),
    newPassword: newPasswordSchema,
    confirm: z.string().min(1, 'Подтвердите пароль'),
  })
  .refine((value) => value.newPassword === value.confirm, {
    path: ['confirm'],
    message: 'Пароли не совпадают',
  })

type ChangePasswordFormInput = z.infer<typeof changePasswordFormSchema>

export function ChangePasswordForm() {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<ChangePasswordFormInput>({
      resolver: zodResolver(changePasswordFormSchema),
      defaultValues: { oldPassword: '', newPassword: '', confirm: '' },
    })
  const [serverError, setServerError] = useState<string | null>(null)
  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await apiFetch('/api/me/password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword: values.oldPassword, newPassword: values.newPassword }),
      })
      toast('Пароль изменён', 'success')
      reset()
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Не удалось изменить пароль')
    }
  })

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
      <div>
        <label className="label" htmlFor="oldPassword">Текущий пароль</label>
        <PasswordField
          id="oldPassword"
          autoComplete="current-password"
          register={register('oldPassword')}
        />
        {errors.oldPassword && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-300">{errors.oldPassword.message}</p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="newPassword">Новый пароль</label>
        <PasswordField
          id="newPassword"
          autoComplete="new-password"
          register={register('newPassword')}
        />
        {errors.newPassword && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-300">{errors.newPassword.message}</p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="confirm">Подтверждение</label>
        <PasswordField
          id="confirm"
          autoComplete="new-password"
          register={register('confirm')}
        />
        {errors.confirm && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-300">{errors.confirm.message}</p>
        )}
      </div>
      {serverError && (
        <FormAlert>{serverError}</FormAlert>
      )}
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? 'Сохраняем...' : 'Сменить пароль'}
      </button>
    </form>
  )
}

function PasswordField({
  id,
  autoComplete,
  register,
}: {
  id: string
  autoComplete: string
  register: UseFormRegisterReturn
}) {
  const [visible, setVisible] = useState(false)

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
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-100"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}
