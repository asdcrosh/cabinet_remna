import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  eyebrow?: string
}

export function PageHeader({ title, description, action, eyebrow = 'Личный кабинет' }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-description">{description}</p>}
        </div>
        {action && <div className="shrink-0 sm:text-right">{action}</div>}
      </div>
    </header>
  )
}
