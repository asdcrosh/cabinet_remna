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
      <PageHeader eyebrow="Управление" title={title} description={description} action={action} />
      {children}
    </div>
  )
}
