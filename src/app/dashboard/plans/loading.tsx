export default function PlansLoading() {
  return (
    <div className="page-stack" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка тарифов</span>
      <header className="border-b border-slate-200/80 pb-4 dark:border-white/10 sm:pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="skeleton h-9 w-44 rounded-lg" />
            <div className="skeleton h-5 w-64 max-w-full rounded-lg" />
          </div>
          <div className="skeleton h-10 w-40 rounded-lg" />
        </div>
      </header>

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="skeleton h-[5.25rem] rounded-lg sm:h-16" />
        <div className="skeleton h-[5.25rem] rounded-lg sm:h-16" />
        <div className="skeleton h-[5.25rem] rounded-lg sm:h-16" />
      </section>

      <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-surface-900">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="skeleton h-7 w-32 rounded-lg" />
                <div className="skeleton h-4 w-48 rounded-lg" />
              </div>
              <div className="skeleton h-10 w-10 rounded-lg" />
            </div>
            <div className="mt-5 skeleton h-10 w-32 rounded-lg" />
            <div className="mt-4 space-y-2">
              <div className="skeleton h-5 rounded-lg" />
              <div className="skeleton h-5 rounded-lg" />
              <div className="skeleton h-5 w-3/4 rounded-lg" />
            </div>
            <div className="mt-5 skeleton h-11 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
