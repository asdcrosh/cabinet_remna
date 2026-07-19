import { Suspense } from 'react'
import { LoaderCircle, ShieldCheck } from 'lucide-react'
import { AppOpenBridge } from '@/components/open-app/app-open-bridge'
import { getBrandName } from '@/lib/branding'

export default function OpenAppPage() {
  const brandName = getBrandName()

  return (
    <Suspense fallback={<OpenAppLoading brandName={brandName} />}>
      <AppOpenBridge brandName={brandName} />
    </Suspense>
  )
}

function OpenAppLoading({ brandName }: { brandName: string }) {
  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-slate-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-white sm:p-8">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="absolute left-1/2 top-[-12rem] h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-200/35 blur-3xl dark:bg-cyan-500/10" />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-4 flex min-w-0 items-center justify-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-cyan-600 shadow-sm ring-1 ring-slate-200/80 dark:bg-white/[0.06] dark:text-cyan-300 dark:ring-white/10">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="truncate">{brandName}</span>
        </div>
        <section className="rounded-[2rem] border border-slate-200/80 bg-white/95 px-5 py-10 text-center shadow-[0_24px_70px_-32px_rgba(15,23,42,0.35)] dark:border-white/[0.1] dark:bg-slate-900/95">
          <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-cyan-600 dark:text-cyan-300" aria-hidden="true" />
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Подготавливаем запуск</h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">Проверяем ссылку приложения</p>
        </section>
      </div>
    </main>
  )
}
