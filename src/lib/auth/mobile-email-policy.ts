const GRACE_MS = 3 * 24 * 60 * 60 * 1000

type AccountEmail = {
  email: string
  emailVerifiedAt: Date | null
  mobileTelegramEmailDueAt?: Date | null
}

export function hasVerifiedEmail(user: AccountEmail) {
  return Boolean(user.emailVerifiedAt && !user.email.endsWith('@pending.invalid'))
}

export function mobileEmailDeadline(user: AccountEmail) {
  return hasVerifiedEmail(user) ? null : user.mobileTelegramEmailDueAt ?? null
}

export function newMobileEmailDeadline(now = Date.now()) {
  return new Date(now + GRACE_MS)
}
