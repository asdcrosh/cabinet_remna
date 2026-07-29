type TabKeyboardEvent = {
  key: string
  preventDefault: () => void
  currentTarget: HTMLElement
  target: EventTarget | null
}

export function nextTabIndex(currentIndex: number, count: number, key: string) {
  if (count <= 0) return null
  if (key === 'ArrowRight') return (currentIndex + 1 + count) % count
  if (key === 'ArrowLeft') return (currentIndex - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

export function handleTabListKeyDown(event: TabKeyboardEvent) {
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])')
  )
  const currentIndex = tabs.indexOf(event.target as HTMLButtonElement)
  if (currentIndex < 0) return
  const nextIndex = nextTabIndex(currentIndex, tabs.length, event.key)
  if (nextIndex == null) return

  event.preventDefault()
  const nextTab = tabs[nextIndex]
  nextTab?.focus()
  nextTab?.click()
}
