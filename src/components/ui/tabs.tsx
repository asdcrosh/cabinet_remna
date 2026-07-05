'use client'

import { cn } from '@/lib/cn'

export interface TabItem<T extends string> {
  value: T
  label: string
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onValueChange: (value: T) => void
  className?: string
}

export function Tabs<T extends string>({ items, value, onValueChange, className }: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-white/10',
        className
      )}
    >
      {items.map((item) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn(
              'h-9 shrink-0 rounded-lg px-3 text-sm font-semibold text-slate-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 dark:text-slate-300',
              selected && 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white'
            )}
            onClick={() => onValueChange(item.value)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
