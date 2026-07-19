export default function SubscriptionLoading() {
  return (
    <div className="page-stack" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка подписки</span>
      <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035] sm:p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="skeleton h-7 w-28 rounded-full" />
            <div className="skeleton h-9 w-52 rounded-xl" />
            <div className="skeleton h-4 w-36 rounded-lg" />
          </div>
          <div className="skeleton h-11 w-full rounded-xl sm:w-48" />
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <div className="skeleton h-[4.5rem] rounded-2xl" />
          <div className="skeleton h-[4.5rem] rounded-2xl" />
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
        <header className="space-y-2 border-b border-slate-100 px-4 py-4 dark:border-white/10 sm:px-5 sm:py-5">
          <div className="skeleton h-4 w-24 rounded-lg" />
          <div className="skeleton h-7 w-64 max-w-full rounded-lg" />
          <div className="skeleton h-4 w-80 max-w-full rounded-lg" />
        </header>
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="skeleton h-52 rounded-2xl" />
              <div className="skeleton h-52 rounded-2xl" />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-2">
              <div className="skeleton h-11 rounded-xl" />
              <div className="skeleton h-11 rounded-xl" />
              <div className="skeleton h-11 rounded-xl sm:hidden" />
            </div>
            <div className="skeleton h-11 rounded-2xl" />
          </div>
          <aside className="hidden border-l border-slate-100 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-white/[0.025] lg:block">
            <div className="skeleton mx-auto aspect-square max-w-[220px] rounded-2xl" />
            <div className="skeleton mx-auto mt-3 h-5 w-36 rounded-lg" />
          </aside>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
        <div className="space-y-2 border-b border-slate-100 px-4 py-4 dark:border-white/10 sm:px-5 sm:py-5">
          <div className="skeleton h-4 w-16 rounded-lg" />
          <div className="skeleton h-7 w-56 rounded-lg" />
          <div className="skeleton h-4 w-80 max-w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="skeleton h-14 rounded-xl" />
            <div className="skeleton h-14 rounded-xl" />
          </div>
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
          <div className="skeleton h-40 rounded-2xl" />
          <div className="skeleton h-40 rounded-2xl" />
        </div>
      </section>
    </div>
  )
}
