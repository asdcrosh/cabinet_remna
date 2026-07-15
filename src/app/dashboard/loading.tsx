export default function DashboardLoading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка кабинета</span>
      <div className="skeleton h-10 w-64 max-w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="skeleton h-36 rounded-2xl" />
        <div className="skeleton h-36 rounded-2xl" />
        <div className="skeleton h-36 rounded-2xl" />
      </div>
      <div className="skeleton h-80 rounded-2xl" />
    </div>
  )
}
