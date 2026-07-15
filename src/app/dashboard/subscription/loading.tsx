export default function SubscriptionLoading() {
  return (
    <div className="page-stack" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка подписки</span>
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-surface-900 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex gap-2">
              <div className="skeleton h-7 w-28 rounded-full" />
              <div className="skeleton h-7 w-32 rounded-full" />
            </div>
            <div className="skeleton h-9 w-44 rounded-xl" />
          </div>
          <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[32rem]">
            <div className="skeleton h-16 rounded-xl" />
            <div className="skeleton h-16 rounded-xl" />
            <div className="skeleton h-16 rounded-xl" />
          </div>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-3">
        <div className="skeleton h-12 rounded-xl" />
        <div className="skeleton h-12 rounded-xl" />
        <div className="skeleton h-12 rounded-xl" />
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-surface-900">
        <div className="grid gap-0 sm:grid-cols-[minmax(0,1fr)_14rem] lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-4 p-4 sm:p-5">
            <div className="skeleton h-7 w-36 rounded-full" />
            <div className="skeleton h-8 w-44 rounded-xl" />
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="skeleton h-16 rounded-xl" />
              <div className="skeleton h-16 rounded-xl" />
              <div className="skeleton h-16 rounded-xl" />
            </div>
            <div className="skeleton h-12 rounded-xl" />
            <div className="skeleton h-10 rounded-xl" />
          </div>
          <aside className="hidden border-l border-slate-100 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.025] sm:block">
            <div className="skeleton mx-auto aspect-square max-w-[180px] rounded-xl" />
            <div className="skeleton mx-auto mt-3 h-6 w-28 rounded-xl" />
          </aside>
        </div>
      </section>
    </div>
  )
}
