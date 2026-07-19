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
    <main className="min-h-dvh px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 flex items-center justify-between gap-3 sm:mb-7">
          <Link href="/" className="flex min-w-0 items-center gap-3 rounded-xl">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span className="truncate text-sm font-semibold sm:text-base">{brandName}</span>
          </Link>
          <Link href={backHref} className="btn-secondary min-h-10 shrink-0 px-3 py-2 text-xs sm:text-sm">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{backLabel}</span>
            <span className="sm:hidden">Назад</span>
          </Link>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-7">
          <nav aria-label="Юридические документы" className="panel flex gap-1 overflow-x-auto p-1.5 lg:sticky lg:top-6 lg:flex-col">
            {legalNavigation.map((document) => {
              const active = document.href === activePath
              return (
                <Link
                  key={document.href}
                  href={document.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition',
                    active
                      ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white',
                  )}
                >
                  <FileText className="h-4 w-4" />
                  {document.label}
                </Link>
              )
            })}
          </nav>

          <article className="panel overflow-hidden">
            <header className="border-b border-slate-200/80 bg-slate-50/60 p-5 sm:p-8 dark:border-white/10 dark:bg-white/[0.025]">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">
                Документы сервиса
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
                {title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
              <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">Редакция от {updatedAt}</p>
            </header>

            <div className="space-y-7 p-5 sm:p-8">{children}</div>

            <footer className="flex flex-col gap-3 border-t border-slate-200/80 bg-slate-50/60 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:border-white/10 dark:bg-white/[0.025]">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-white">Есть вопрос по документам?</div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Напишите в поддержку с email вашего аккаунта.</div>
              </div>
              <a href={`mailto:${supportEmail}`} className="btn-secondary w-full sm:w-auto">
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
    <section className="space-y-3 border-t border-slate-200/80 pt-7 first:border-t-0 first:pt-0 dark:border-white/10">
      <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h2>
      <div className="space-y-3 text-[15px] leading-7 text-slate-600 dark:text-slate-300">{children}</div>
    </section>
  )
}
