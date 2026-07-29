import * as React from 'react'
import { cn } from '@/lib/cn'

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked'> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  description?: string
  compact?: boolean
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({
    checked,
    onCheckedChange,
    label,
    description,
    compact = false,
    className,
    disabled,
    ...props
  }, ref) => (
    <label
      className={cn(
        'group cursor-pointer',
        compact
          ? 'inline-flex shrink-0 items-center'
          : 'flex min-h-11 w-full items-center justify-between gap-4',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <span className={compact ? 'sr-only' : 'min-w-0'}>
        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span>
        ) : null}
      </span>
      <input
        {...props}
        ref={ref}
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors',
          'after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform',
          'border-slate-300 bg-slate-200 group-hover:border-slate-400',
          'peer-checked:border-cyan-500 peer-checked:bg-cyan-500 peer-checked:after:translate-x-5',
          'peer-focus-visible:ring-4 peer-focus-visible:ring-cyan-400/25',
          'dark:border-white/15 dark:bg-white/10 dark:peer-checked:border-cyan-300 dark:peer-checked:bg-cyan-300',
        )}
      />
    </label>
  ),
)

Switch.displayName = 'Switch'
