import {
  getWhitelistAddonPauseAt,
  getWhitelistAddonRemainingSeconds,
  isWhitelistAddonCurrentlyActive,
} from './whitelist-addon-policy'

type WhitelistRewardSource = {
  whitelistAddonActive: boolean
  whitelistAddonExpireAt?: Date | null
  whitelistAddonRemainingSeconds?: bigint | null
  whitelistAddonPausedAt?: Date | null
  whitelistAddonInternalSquads?: string[]
  whitelistAddonRewardSeconds?: bigint
  whitelistAddonRewardSquads?: string[]
  status?: string
  expireAt?: Date
  graceExpireAt?: Date | null
  updatedAt?: Date
}

export function whitelistAddonTimeLeft(source: WhitelistRewardSource, now: Date) {
  if (source.whitelistAddonRemainingSeconds && source.whitelistAddonRemainingSeconds > 0n) {
    return source.whitelistAddonRemainingSeconds
  }
  if (!source.whitelistAddonActive) return 0n
  return getWhitelistAddonRemainingSeconds(source.whitelistAddonExpireAt,
    isWhitelistAddonCurrentlyActive(source, now) ? now : getWhitelistAddonPauseAt(source, now))
}

export function whitelistRewardTimeLeft(source: WhitelistRewardSource, now: Date) {
  const remaining = whitelistAddonTimeLeft(source, now)
  const reward = source.whitelistAddonRewardSeconds ?? 0n
  return reward < remaining ? reward : remaining
}

export function buildWhitelistRewardGrant(source: WhitelistRewardSource, days: number, squads: string[], now: Date) {
  if (!Number.isInteger(days) || days < 1 || days > 10_000 || squads.length === 0) {
    throw new Error('Не настроены срок или сквады награды «Белые списки»')
  }
  const remaining = whitelistAddonTimeLeft(source, now)
  const rewardSeconds = whitelistRewardTimeLeft(source, now) + BigInt(days) * 86400n
  return {
    whitelistAddonActive: true,
    whitelistAddonActivatedAt: now,
    whitelistAddonExpireAt: new Date(now.getTime() + Number(remaining + BigInt(days) * 86400n) * 1000),
    whitelistAddonPausedAt: null,
    whitelistAddonRemainingSeconds: null,
    whitelistAddonRewardSeconds: rewardSeconds,
    whitelistAddonRewardSquads: [...new Set([
      ...(whitelistRewardTimeLeft(source, now) > 0n ? source.whitelistAddonRewardSquads ?? [] : []),
      ...squads,
    ])],
    whitelistAddonInternalSquads: [...new Set([
      ...(remaining > 0n ? source.whitelistAddonInternalSquads ?? [] : []),
      ...squads,
    ])],
  }
}
