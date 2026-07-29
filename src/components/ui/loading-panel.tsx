import { cn } from '@/lib/cn'

export function LoadingPanel({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn('space-y-4 border-y border-slate-200/90 py-5 dark:border-white/[0.09]', className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-3">
        <div className="skeleton h-9 w-1 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="skeleton h-4 w-36 max-w-full" />
          <div className="skeleton h-3 w-56 max-w-[85%]" />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="skeleton h-12 rounded-lg" />
        <div className="skeleton h-12 rounded-lg" />
        <div className="skeleton h-12 rounded-lg" />
      </div>
    </div>
  )
}
