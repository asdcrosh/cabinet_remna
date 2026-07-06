'use client'

import { useEffect, useMemo, useState } from 'react'

export function CountUp({
  value,
  prefix = '',
  suffix = '',
  durationMs = 620,
}: {
  value: number
  prefix?: string
  suffix?: string
  durationMs?: number
}) {
  const [displayValue, setDisplayValue] = useState(0)
  const target = Number.isFinite(value) ? value : 0

  const formatter = useMemo(() => new Intl.NumberFormat('ru-RU'), [])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayValue(target)
      return
    }

    let frameId = 0
    const startedAt = performance.now()

    function tick(now: number) {
      const progress = Math.min(1, (now - startedAt) / durationMs)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(target * eased))
      if (progress < 1) frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [durationMs, target])

  return <>{prefix}{formatter.format(displayValue)}{suffix}</>
}
