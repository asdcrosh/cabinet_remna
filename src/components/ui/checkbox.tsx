import * as React from 'react'
import { cn } from '@/lib/cn'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode
  description?: React.ReactNode
  compact?: boolean
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, compact = false, className, disabled, ...props }, ref) => (
    <label
      className={cn(
        'group inline-flex cursor-pointer items-start gap-3',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input {...props} ref={ref} type="checkbox" disabled={disabled} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={cn(
          'relative mt-0.5 h-5 w-5 shrink-0 rounded-[6px] border border-slate-300 bg-white transition',
          'after:absolute after:left-[6px] after:top-[2px] after:hidden after:h-3 after:w-1.5 after:rotate-45 after:border-b-2 after:border-r-2 after:border-white',
          'peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:after:block',
          'peer-focus-visible:ring-4 peer-focus-visible:ring-brand-400/20',
          'dark:border-white/20 dark:bg-white/[0.05] dark:peer-checked:border-brand-400 dark:peer-checked:bg-brand-400 dark:peer-checked:after:border-white',
        )}
      />
      <span className={compact ? 'sr-only' : 'min-w-0 text-sm leading-5 text-slate-700 dark:text-slate-200'}>
        <span className="block">{label}</span>
        {description ? <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span> : null}
      </span>
    </label>
  ),
)

Checkbox.displayName = 'Checkbox'
