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

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="space-y-2">
            <div className="skeleton h-6 w-36 rounded-lg" />
            <div className="skeleton h-4 w-72 max-w-full rounded-lg" />
          </div>
          <div className="skeleton h-7 w-20 rounded-full" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(25rem,0.72fr)] xl:items-start">
          <div className="rounded-[1.75rem] border border-slate-200/80 bg-slate-50/65 p-3 dark:border-white/[0.08] dark:bg-white/[0.025] sm:p-4">
            <div className="mb-4 space-y-2 px-1">
              <div className="skeleton h-3 w-28 rounded" />
              <div className="skeleton h-6 w-48 rounded-lg" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-[1.2rem] border border-slate-200/70 bg-white/70 p-4 dark:border-white/[0.07] dark:bg-white/[0.025]">
                  <div className="flex items-center gap-3">
                    <div className="skeleton h-6 w-6 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="skeleton h-5 w-40 max-w-full rounded-lg" />
                      <div className="skeleton h-3 w-64 max-w-full rounded" />
                    </div>
                    <div className="hidden space-y-2 sm:block">
                      <div className="skeleton ml-auto h-3 w-20 rounded" />
                      <div className="skeleton ml-auto h-6 w-24 rounded-lg" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="skeleton mt-3 h-14 rounded-2xl" />
          </div>

          <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-4 dark:border-white/[0.09] dark:bg-white/[0.035] sm:p-5">
            <div className="flex items-center gap-3">
              <div className="skeleton h-11 w-11 rounded-2xl" />
              <div className="skeleton h-7 w-44 rounded-lg" />
            </div>
            <div className="skeleton mt-5 h-32 rounded-[1.35rem]" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="skeleton h-28 rounded-2xl" />
              <div className="skeleton h-28 rounded-2xl" />
              <div className="skeleton h-28 rounded-2xl" />
            </div>
            <div className="skeleton mt-4 h-14 rounded-[1.15rem]" />
            <div className="skeleton mt-3 h-12 rounded-xl" />
          </div>
        </div>
      </section>

      <div className="skeleton h-20 rounded-[1.75rem]" />
    </div>
  )
}
