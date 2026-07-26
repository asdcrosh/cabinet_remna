export default function DashboardLoading() {
  return (
    <div className="page-stack" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка кабинета</span>
      <header className="space-y-2 pb-1">
        <div className="skeleton h-9 w-72 max-w-full rounded-lg" />
        <div className="skeleton h-4 w-96 max-w-full rounded-md" />
      </header>
      <div className="access-pass grid min-h-72 lg:grid-cols-2">
        <div className="space-y-8 p-5 sm:p-6">
          <div className="skeleton h-6 w-44 rounded-md" />
          <div className="space-y-3">
            <div className="skeleton h-4 w-32 rounded-md" />
            <div className="skeleton h-12 w-48 rounded-lg" />
            <div className="skeleton h-4 w-56 max-w-full rounded-md" />
          </div>
        </div>
        <div className="border-t border-dashed border-slate-300 p-5 dark:border-white/15 sm:p-6 lg:border-l lg:border-t-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="skeleton h-12 rounded-lg" />
            <div className="skeleton h-12 rounded-lg" />
          </div>
          <div className="skeleton mt-8 h-1.5 rounded-full" />
          <div className="skeleton mt-16 h-11 rounded-lg" />
        </div>
      </div>
      <div className="skeleton h-16 rounded-lg" />
    </div>
  )
}
