const dialogStack: symbol[] = []

export function registerDialogLayer(layerId: symbol) {
  const existingIndex = dialogStack.indexOf(layerId)
  if (existingIndex >= 0) dialogStack.splice(existingIndex, 1)
  dialogStack.push(layerId)

  return () => {
    const index = dialogStack.lastIndexOf(layerId)
    if (index >= 0) dialogStack.splice(index, 1)
  }
}

export function isTopDialogLayer(layerId: symbol) {
  return dialogStack[dialogStack.length - 1] === layerId
}
