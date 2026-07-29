'use client'

import { useCallback, useEffect, useRef, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ADMIN_LIST_MAX_SIZE } from '@/lib/admin-list'

type LazyListLoaderProps = {
  loaded: number
  total: number
  step?: number
  param?: string
  max?: number
}

export function LazyListLoader({
  loaded,
  total,
  step = 25,
  param = 'limit',
  max = ADMIN_LIST_MAX_SIZE,
}: LazyListLoaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const markerRef = useRef<HTMLDivElement | null>(null)
  const hasMore = loaded < total && loaded < max

  const loadMore = useCallback(() => {
    if (!hasMore || isPending) return
    startTransition(() => {
      const nextLimit = Math.min(Math.max(loaded + step, step), total, max)
      const next = new URLSearchParams(searchParams.toString())
      next.set(param, String(nextLimit))
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    })
  }, [hasMore, isPending, loaded, step, total, max, searchParams, param, pathname, router])

  useEffect(() => {
    const marker = markerRef.current
    if (!marker || !hasMore) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          loadMore()
        }
      },
      { root: null, rootMargin: '240px 0px', threshold: 0 },
    )

    observer.observe(marker)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  if (!hasMore) {
    if (loaded < total && loaded >= max) {
      return (
        <p className="py-5 text-center text-xs text-slate-500">
          Показаны первые {loaded} из {total}. Уточните фильтр, чтобы найти остальные.
        </p>
      )
    }
    return null
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <div ref={markerRef} aria-hidden className="h-px w-full" />
      <button
        type="button"
        onClick={loadMore}
        disabled={isPending}
        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {isPending ? 'Загрузка…' : 'Показать ещё'}
      </button>
      <p className="text-xs text-slate-500">
        Показано {loaded} из {total}
      </p>
    </div>
  )
}
