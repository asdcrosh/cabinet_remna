export default function PlansLoading() {
  return (
    <div className="page-stack">
      <header className="rounded-lg border border-white/70 bg-white/72 p-4 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-surface-950/45 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="skeleton h-9 w-44 rounded-lg" />
            <div className="skeleton h-5 w-64 max-w-full rounded-lg" />
          </div>
          <div className="skeleton h-10 w-40 rounded-lg" />
        </div>
      </header>

      <section className="card p-3 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="space-y-2">
            <div className="skeleton h-8 w-56 rounded-lg" />
            <div className="skeleton h-5 w-72 max-w-full rounded-lg" />
          </div>
          <div className="hidden grid-cols-3 gap-2 sm:grid lg:w-[34rem]">
            <div className="skeleton h-14 rounded-lg" />
            <div className="skeleton h-14 rounded-lg" />
            <div className="skeleton h-14 rounded-lg" />
          </div>
        </div>
      </section>

      <div className="grid auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:gap-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-surface-900">
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
