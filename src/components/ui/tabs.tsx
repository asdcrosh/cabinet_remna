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
        'inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-white/10',
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
              'h-9 shrink-0 rounded-lg px-3 text-sm font-semibold text-slate-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 dark:text-slate-300',
              selected && 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white'
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
