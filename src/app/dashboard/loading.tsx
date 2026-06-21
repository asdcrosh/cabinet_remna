export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-64 animate-pulse rounded-xl bg-slate-200 dark:bg-surface-800" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-36 animate-pulse rounded-2xl bg-slate-200 dark:bg-surface-800" />
        <div className="h-36 animate-pulse rounded-2xl bg-slate-200 dark:bg-surface-800" />
        <div className="h-36 animate-pulse rounded-2xl bg-slate-200 dark:bg-surface-800" />
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-slate-200 dark:bg-surface-800" />
    </div>
  )
}
