import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft, FileText, Mail, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { legalNavigation, type LegalPath } from '@/lib/legal-links'

interface LegalPageProps {
  activePath: LegalPath
  backHref: string
  backLabel: string
  brandName: string
  children: ReactNode
  description: string
  supportEmail: string
  title: string
  updatedAt: string
}

export function LegalPage({
  activePath,
  backHref,
  backLabel,
  brandName,
  children,
  description,
  supportEmail,
  title,
  updatedAt,
}: LegalPageProps) {
  return (
    <main className="min-h-dvh bg-slate-50/70 px-3 py-3 dark:bg-surface-950 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-950/[0.03] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none sm:mb-6 sm:p-4">
          <Link href="/" className="flex min-w-0 items-center gap-3 rounded-2xl">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span className="truncate text-sm font-semibold text-slate-950 dark:text-white sm:text-base">{brandName}</span>
          </Link>
          <Link href={backHref} className="btn-secondary min-h-10 shrink-0 justify-center rounded-2xl px-3 py-2 text-xs sm:text-sm">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{backLabel}</span>
            <span className="sm:hidden">Назад</span>
          </Link>
        </header>

        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-6">
          <nav
            aria-label="Юридические документы"
            className="flex snap-x gap-1.5 overflow-x-auto rounded-3xl border border-slate-200 bg-white p-1.5 shadow-sm shadow-slate-950/[0.03] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none lg:sticky lg:top-6 lg:flex-col lg:overflow-visible"
          >
            {legalNavigation.map((document) => {
              const active = document.href === activePath
              return (
                <Link
                  key={document.href}
                  href={document.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white',
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  {document.label}
                </Link>
              )
            })}
          </nav>

          <article className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-950/[0.03] dark:border-white/10 dark:bg-white/[0.025] dark:shadow-none">
            <header className="border-b border-slate-200/80 bg-gradient-to-br from-cyan-50/80 via-white to-white p-5 dark:border-white/10 dark:from-cyan-400/[0.08] dark:via-white/[0.02] dark:to-transparent sm:p-8">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">
                Документы сервиса
              </div>
              <h1 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                {title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
              <p className="mt-4 inline-flex rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
                Редакция от {updatedAt}
              </p>
            </header>

            <div className="space-y-4 bg-slate-50/60 p-3 dark:bg-black/10 sm:p-6">{children}</div>

            <footer className="flex flex-col gap-4 border-t border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-white">Есть вопрос по документам?</div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Напишите в поддержку с email вашего аккаунта.</div>
              </div>
              <a href={`mailto:${supportEmail}`} className="btn-secondary min-h-11 w-full justify-center rounded-2xl sm:w-auto">
                <Mail className="h-4 w-4" />
                Написать в поддержку
              </a>
            </footer>
          </article>
        </div>
      </div>
    </main>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/[0.025] dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-slate-600 dark:text-slate-300">{children}</div>
    </section>
  )
}
