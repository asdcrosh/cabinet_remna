export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-10 w-64 rounded-xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="skeleton h-36 rounded-lg" />
        <div className="skeleton h-36 rounded-lg" />
        <div className="skeleton h-36 rounded-lg" />
      </div>
      <div className="skeleton h-80 rounded-lg" />
    </div>
  )
}
