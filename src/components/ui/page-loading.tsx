import { cn } from '@/lib/cn'

export function PageLoading({
  label,
  rows = 3,
  split = false,
}: {
  label: string
  rows?: number
  split?: boolean
}) {
  return (
    <div className="page-stack" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>

      <header className="border-b border-slate-200/80 pb-4 dark:border-white/10 sm:pb-5">
        <div className="skeleton h-3 w-28 rounded" />
        <div className="skeleton mt-3 h-9 w-52 max-w-[75%] rounded-lg" />
        <div className="skeleton mt-3 h-4 w-80 max-w-full rounded" />
      </header>

      <div className={cn('grid gap-5', split && 'lg:grid-cols-2 lg:items-start')}>
        <LoadingRows rows={rows} />
        {split ? <LoadingSummary /> : null}
      </div>
    </div>
  )
}

function LoadingRows({ rows }: { rows: number }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white dark:border-white/[0.09] dark:bg-white/[0.025]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200/80 px-4 py-4 dark:border-white/[0.08] sm:px-5">
        <div className="skeleton h-4 w-32 rounded" />
        <div className="skeleton h-3 w-16 rounded" />
      </div>
      <div className="divide-y divide-slate-200/80 border-t border-slate-200/80 dark:divide-white/[0.08] dark:border-white/[0.08]">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 sm:px-5">
            <div className="min-w-0 space-y-2">
              <div className="skeleton h-4 w-44 max-w-[75%] rounded" />
              <div className="skeleton h-3 w-64 max-w-full rounded" />
            </div>
            <div className="skeleton h-9 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    </section>
  )
}

function LoadingSummary() {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-4 dark:border-white/[0.09] dark:bg-white/[0.025] sm:p-5">
      <div className="flex items-center gap-3">
        <div className="skeleton h-10 w-10 rounded-lg" />
        <div className="skeleton h-5 w-40 rounded" />
      </div>
      <div className="mt-5 skeleton h-20 rounded-lg" />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="skeleton h-14 rounded-lg" />
        <div className="skeleton h-14 rounded-lg" />
        <div className="skeleton h-14 rounded-lg" />
      </div>
      <div className="mt-4 skeleton h-11 rounded-lg" />
    </section>
  )
}
