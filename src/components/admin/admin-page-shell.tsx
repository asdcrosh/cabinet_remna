import type { ReactNode } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'

interface AdminPageShellProps {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}

export function AdminPageShell({ title, description, action, children }: AdminPageShellProps) {
  return (
    <div className="page-stack min-w-0">
      <div className="rounded-[1.5rem] border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-white/[0.08] dark:bg-white/[0.025] sm:px-5 sm:py-5">
        <PageHeader title={title} description={description} action={action} />
      </div>
      {children}
    </div>
  )
}
