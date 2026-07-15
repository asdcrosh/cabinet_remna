import { cn } from '@/lib/cn'

export function LoadingPanel({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn('card space-y-4 p-5', className)} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-3">
        <div className="skeleton h-11 w-11 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="skeleton h-4 w-36 max-w-full" />
          <div className="skeleton h-3 w-56 max-w-[85%]" />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="skeleton h-14 rounded-xl" />
        <div className="skeleton h-14 rounded-xl" />
        <div className="skeleton h-14 rounded-xl" />
      </div>
    </div>
  )
}
