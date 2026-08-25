import type { ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'

interface AdminPageShellProps {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}

export function AdminPageShell({ title, description, action, children }: AdminPageShellProps) {
  return (
    <div className="admin-workspace page-stack min-w-0">
      <header className="admin-page-hero">
        <div aria-hidden="true" className="admin-page-hero__glow" />
        <div className="admin-page-hero__content">
          <div className="min-w-0">
            <p className="admin-page-hero__eyebrow">
              <span />
              Управление
            </p>
            <h1 className="admin-page-hero__title">{title}</h1>
            {description ? <p className="admin-page-hero__description">{description}</p> : null}
          </div>
          <div className="admin-page-hero__aside">
            {action ? <div className="admin-page-hero__action">{action}</div> : null}
            <span className="admin-page-hero__mark" aria-hidden="true">
              <ShieldCheck className="h-6 w-6" />
            </span>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
