'use client'

import { useEffect } from 'react'

let lockCount = 0
let saved:
  | {
      scrollY: number
      bodyPosition: string
      bodyTop: string
      bodyWidth: string
      bodyOverflow: string
      bodyPaddingRight: string
      htmlOverflow: string
    }
  | null = null

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof window === 'undefined') return

    const { body, documentElement } = document
    lockCount += 1

    if (lockCount === 1) {
      const scrollY = window.scrollY
      const scrollbarWidth = Math.max(0, window.innerWidth - documentElement.clientWidth)

      saved = {
        scrollY,
        bodyPosition: body.style.position,
        bodyTop: body.style.top,
        bodyWidth: body.style.width,
        bodyOverflow: body.style.overflow,
        bodyPaddingRight: body.style.paddingRight,
        htmlOverflow: documentElement.style.overflow,
      }

      documentElement.style.overflow = 'hidden'
      body.style.position = 'fixed'
      body.style.top = `-${scrollY}px`
      body.style.width = '100%'
      body.style.overflow = 'hidden'
      if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      lockCount = Math.max(0, lockCount - 1)
      if (lockCount > 0 || !saved) return

      const restore = saved
      saved = null
      documentElement.style.overflow = restore.htmlOverflow
      body.style.position = restore.bodyPosition
      body.style.top = restore.bodyTop
      body.style.width = restore.bodyWidth
      body.style.overflow = restore.bodyOverflow
      body.style.paddingRight = restore.bodyPaddingRight
      window.scrollTo(0, restore.scrollY)
    }
  }, [locked])
}
