'use client'

import { useEffect } from 'react'

export function useUnsavedChanges(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    function preventAccidentalLeave(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', preventAccidentalLeave)
    return () => window.removeEventListener('beforeunload', preventAccidentalLeave)
  }, [enabled])
}
