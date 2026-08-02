'use client'

import { useRef } from 'react'
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
  ariaLabel?: string
}

export function Tabs<T extends string>({ items, value, onValueChange, className, ariaLabel = 'Разделы' }: TabsProps<T>) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  function selectTab(index: number) {
    const item = items[index]
    if (!item) return
    onValueChange(item.value)
    window.requestAnimationFrame(() => tabRefs.current[index]?.focus())
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex max-w-full gap-1 overflow-x-auto rounded-[12px] border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.03]',
        className
      )}
    >
      {items.map((item, index) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            ref={(element) => { tabRefs.current[index] = element }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={cn(
              'h-9 shrink-0 rounded-[8px] px-3 text-sm font-semibold text-slate-500 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-slate-400',
              selected && 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
            )}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault()
                selectTab((index + 1) % items.length)
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault()
                selectTab((index - 1 + items.length) % items.length)
              } else if (event.key === 'Home') {
                event.preventDefault()
                selectTab(0)
              } else if (event.key === 'End') {
                event.preventDefault()
                selectTab(items.length - 1)
              }
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
