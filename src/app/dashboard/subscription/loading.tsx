export default function SubscriptionLoading() {
  return (
    <div className="page-stack" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка подписки</span>
      <header className="space-y-2">
        <div className="skeleton h-9 w-52 rounded-lg" />
        <div className="skeleton h-4 w-96 max-w-full rounded-md" />
      </header>

      <section className="access-pass">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-5 p-4 sm:p-5">
            <div className="skeleton h-5 w-56 max-w-full rounded-md" />
            <div className="grid gap-3 border-t border-dashed border-slate-300 pt-4 dark:border-white/15 sm:grid-cols-3">
              <div className="skeleton h-10 rounded-md" />
              <div className="skeleton h-10 rounded-md" />
              <div className="skeleton h-10 rounded-md" />
            </div>
          </div>
          <div className="border-t border-dashed border-slate-300 p-4 dark:border-white/15 lg:border-l lg:border-t-0">
            <div className="skeleton h-11 w-full rounded-lg lg:w-44" />
          </div>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
          <div className="space-y-2 border-b border-slate-200 p-4 dark:border-white/10">
            <div className="skeleton h-5 w-48 rounded-md" />
            <div className="skeleton h-3 w-72 max-w-full rounded-md" />
          </div>
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="skeleton h-14 rounded-xl" />
              <div className="skeleton h-14 rounded-xl" />
            </div>
            <div className="skeleton h-16 rounded-lg" />
            <div className="skeleton h-11 rounded-lg" />
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
          <div className="space-y-2 border-b border-slate-200 p-4 dark:border-white/10">
            <div className="skeleton h-5 w-28 rounded-md" />
            <div className="skeleton h-3 w-44 rounded-md" />
          </div>
          <div className="space-y-2 p-4">
            <div className="skeleton h-12 rounded-lg" />
            <div className="skeleton h-12 rounded-lg" />
          </div>
        </section>
      </div>
    </div>
  )
}
