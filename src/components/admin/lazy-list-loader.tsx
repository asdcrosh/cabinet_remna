'use client'

import { useEffect, useRef, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function LazyListLoader({
  loaded,
  total,
  step = 25,
  param = 'limit',
}: {
  loaded: number
  total: number
  step?: number
  param?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const markerRef = useRef<HTMLDivElement | null>(null)
  const [isPending, startTransition] = useTransition()
  const hasMore = loaded < total

  function loadMore() {
    if (!hasMore || isPending) return
    const params = new URLSearchParams(searchParams.toString())
    params.set(param, String(Math.min(total, loaded + step)))
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  useEffect(() => {
    const marker = markerRef.current
    if (!marker || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: '240px 0px' }
    )
    observer.observe(marker)
    return () => observer.disconnect()
  })

  if (total === 0) return null

  return (
    <div ref={markerRef} className="flex flex-col items-center gap-2 py-2">
      <div className="text-xs text-slate-500">
        Показано {loaded} из {total}
      </div>
      {hasMore && (
        <button type="button" className="btn-secondary min-w-40" onClick={loadMore} disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? 'Загружаем...' : 'Показать ещё'}
        </button>
      )}
    </div>
  )
}
