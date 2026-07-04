'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/auth/validation'
import { toast } from '@/components/ui/toaster'

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '' },
  })
  const [showPassword, setShowPassword] = useState(false)

  const onSubmit = handleSubmit(async (values) => {
    await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(values),
    })
    toast('Пароль обновлён', 'success')
    router.push('/login')
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">Новый пароль</label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            className="input pr-11"
            {...register('password')}
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
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
      </div>
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? 'Сохраняем...' : 'Сохранить пароль'}
      </button>
    </form>
  )
}
