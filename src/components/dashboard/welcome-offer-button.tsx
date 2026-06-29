'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'

export function WelcomeOfferButton({ label }: { label: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function claim() {
    setLoading(true)
    try {
      const result = await apiFetch<{
        type: 'TRIAL_PLAN' | 'BONUS_BOX_ATTEMPTS'
        redirectUrl: string
        message: string
      }>('/api/offers/welcome/claim', { method: 'POST' })
      toast(result.message, 'success')
      router.push(result.redirectUrl)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      className="btn-primary min-h-11 shrink-0 justify-center px-4"
      onClick={() => void claim()}
      disabled={loading}
    >
      <Sparkles className="h-4 w-4" />
      {loading ? 'Начисляем...' : label}
    </button>
  )
}
