'use client'

import { useEffect } from 'react'

const CONFIRM_MESSAGE = 'Есть несохранённые изменения. Покинуть страницу?'
let activeGuards = 0
let removeNavigationListeners: (() => void) | null = null

type NavigationEventLike = Event & {
  canIntercept?: boolean
  destination?: { url: string }
  downloadRequest?: string | null
  hashChange?: boolean
  navigationType?: string
}

type NavigationLike = {
  addEventListener: (type: 'navigate', listener: EventListener) => void
  removeEventListener: (type: 'navigate', listener: EventListener) => void
}

export function useUnsavedChanges(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    activeGuards += 1
    if (activeGuards === 1) removeNavigationListeners = installNavigationGuard()

    return () => {
      activeGuards = Math.max(0, activeGuards - 1)
      if (activeGuards === 0) {
        removeNavigationListeners?.()
        removeNavigationListeners = null
      }
    }
  }, [enabled])
}

function installNavigationGuard() {
  const preventAccidentalLeave = (event: BeforeUnloadEvent) => {
    event.preventDefault()
    event.returnValue = ''
  }

  const navigation = (window as Window & { navigation?: NavigationLike }).navigation
  const preventNavigation = ((event: NavigationEventLike) => {
    if (
      !event.cancelable
      || event.canIntercept === false
      || event.navigationType !== 'traverse'
      || event.downloadRequest
      || event.hashChange
      || !event.destination?.url
      || isCurrentPage(event.destination.url)
    ) return

    if (!window.confirm(CONFIRM_MESSAGE)) event.preventDefault()
  }) as EventListener

  const preventLinkNavigation = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest<HTMLAnchorElement>('a[href]')
    if (!anchor || anchor.download || (anchor.target && anchor.target !== '_self')) return
    const destination = new URL(anchor.href, window.location.href)
    if (destination.origin !== window.location.origin || isCurrentPage(destination.href)) return

    if (!window.confirm(CONFIRM_MESSAGE)) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }

  window.addEventListener('beforeunload', preventAccidentalLeave)
  if (navigation) navigation.addEventListener('navigate', preventNavigation)
  document.addEventListener('click', preventLinkNavigation, true)

  return () => {
    window.removeEventListener('beforeunload', preventAccidentalLeave)
    if (navigation) navigation.removeEventListener('navigate', preventNavigation)
    document.removeEventListener('click', preventLinkNavigation, true)
  }
}

function isCurrentPage(value: string) {
  const destination = new URL(value, window.location.href)
  return destination.origin === window.location.origin
    && destination.pathname === window.location.pathname
}
