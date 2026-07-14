'use client'

import { useState } from 'react'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { apiFetch } from '@/lib/api-client'
import { newPasswordSchema } from '@/lib/auth/validation'
import { toast } from '@/components/ui/toaster'
import { Eye, EyeOff } from 'lucide-react'

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
  const [visible, setVisible] = useState(false)
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
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
      <div>
        <label className="label" htmlFor="oldPassword">Текущий пароль</label>
        <PasswordField
          id="oldPassword"
          autoComplete="current-password"
          visible={visible}
          toggle={() => setVisible((value) => !value)}
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
          visible={visible}
          toggle={() => setVisible((value) => !value)}
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
          visible={visible}
          toggle={() => setVisible((value) => !value)}
          register={register('confirm')}
        />
        {errors.confirm && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-300">{errors.confirm.message}</p>
        )}
      </div>
      {serverError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
          {serverError}
        </div>
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
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-100"
        onClick={toggle}
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}
