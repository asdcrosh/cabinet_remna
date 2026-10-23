import { remnawave, remnawaveUserReference } from './remnawave'

// Keep unrelated, manually assigned squads. Remove only squads owned by this entitlement.
export function mergeWhitelistSquads(input: {
  current: string[]
  base: string[]
  addon: string[]
  previousAddon?: string[]
  previousBase?: string[]
}) {
  const removed = new Set([...(input.previousAddon ?? []), ...(input.previousBase ?? [])])
  return [...new Set([
    ...input.current.filter((id) => !removed.has(id)),
    ...input.base,
    ...input.addon,
  ])]
}

export async function updateWhitelistSquads(
  user: Parameters<typeof remnawaveUserReference>[0],
  base: string[],
  addon: string[],
  previousAddon: string[] = []
) {
  const reference = remnawaveUserReference(user)
  const remote = (await remnawave.getUser(reference)).response
  if (!Array.isArray(remote.activeInternalSquads)) {
    throw new Error('Не удалось проверить текущие сквады Remnawave')
  }
  return remnawave.updateUser(reference, {
    activeInternalSquads: mergeWhitelistSquads({
      current: remote.activeInternalSquads.map((squad) => squad.uuid),
      // Base access is already present on the remote user. A cached plan must not
      // restore old squads after a concurrent plan change in the shop.
      base: [],
      addon,
      previousAddon: previousAddon.filter((id) => !base.includes(id)),
    }),
  })
}
