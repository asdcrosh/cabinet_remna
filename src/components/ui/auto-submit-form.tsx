'use client'

import type { FormEvent, ReactNode } from 'react'
import { useCallback, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type AutoSubmitFormProps = {
  action: string
  children: ReactNode
  className?: string
  id?: string
  ariaLabel?: string
  debounceMs?: number
}

export function AutoSubmitForm({
  action,
  children,
  className,
  id,
  ariaLabel,
  debounceMs = 350,
}: AutoSubmitFormProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composingRef = useRef(false)
  const [isPending, startTransition] = useTransition()

  const clearScheduledSubmit = useCallback(() => {
    if (!timeoutRef.current) return
    clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }, [])

  const applyFilters = useCallback(() => {
    const form = formRef.current
    if (!form) return

    clearScheduledSubmit()
    const params = new URLSearchParams()
    for (const [name, value] of new FormData(form).entries()) {
      if (typeof value === 'string' && value !== '') params.append(name, value)
    }
    const query = params.toString()

    startTransition(() => {
      router.replace(query ? `${action}?${query}` : action, { scroll: false })
    })
  }, [action, clearScheduledSubmit, router])

  useEffect(() => clearScheduledSubmit, [clearScheduledSubmit])

  function handleChange(event: FormEvent<HTMLFormElement>) {
    const field = event.target
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return
    if (field instanceof HTMLInputElement && ['text', 'search'].includes(field.type)) {
      if (composingRef.current) return
      clearScheduledSubmit()
      timeoutRef.current = setTimeout(applyFilters, debounceMs)
      return
    }
    applyFilters()
  }

  return (
    <form
      ref={formRef}
      id={id}
      action={action}
      aria-label={ariaLabel}
      aria-busy={isPending}
      className={className}
      onChange={handleChange}
      onCompositionStart={() => {
        composingRef.current = true
      }}
      onCompositionEnd={() => {
        composingRef.current = false
        clearScheduledSubmit()
        timeoutRef.current = setTimeout(applyFilters, debounceMs)
      }}
      onSubmit={(event) => {
        event.preventDefault()
        applyFilters()
      }}
    >
      {children}
      <span className="sr-only" aria-live="polite">{isPending ? 'Обновляем список' : ''}</span>
    </form>
  )
}
