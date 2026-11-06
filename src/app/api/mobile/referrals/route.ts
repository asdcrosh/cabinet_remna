// GET /api/mobile/referrals?page=N — «Пригласить друга» для приложения StealthNet:
// ссылка, условия, итоги и приглашённые (50 на страницу), как на /dashboard/referrals.
import { jsonResponse } from '@/lib/json-response'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { rateLimit } from '@/lib/rate-limit'
import {
  displayReferralName,
  getReferralOverview,
  getReferralStatus,
  maskEmail,
  referralConditionText,
  referralPaidAt,
} from '@/lib/referral-overview'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  if (!await isFeatureEnabled('referrals')) return jsonResponse({ error: 'Not found' }, { status: 404 })
  const session = await requireAuth()
  const limited = await rateLimit(req, `mobile-referrals:${session.uid}`, 30, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const requested = Number(new URL(req.url).searchParams.get('page'))
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1
  const o = await getReferralOverview(session.uid, page)

  return jsonResponse({
    code: o.referralCode,
    url: o.referralUrl,
    condition: referralConditionText(o.settings),
    rewards: {
      trigger: o.settings.trigger,
      referrerBonusDays: o.settings.referrerBonusDays,
      referredBonusDays: o.settings.referredBonusDays,
      referrerAttempts: o.settings.referrerAttempts,
      referredAttempts: o.settings.referredAttempts,
      minimumPaymentKopecks: o.settings.minimumPaymentKopecks,
      promotionEndsAt: o.settings.promotionEndsAt,
    },
    stats: {
      invited: o.invitedCount,
      paid: o.paidCount,
      conversion: o.conversion,
      appliedDays: o.appliedDays,
      pendingDays: o.pendingDays,
    },
    page,
    pages: o.pages,
    // Почта приглашённого — только маской, как на странице кабинета.
    referrals: o.referrals.map((user) => {
      const paidAt = referralPaidAt(user)
      const reward = getReferralStatus(user.referralRewardAsReferred, Boolean(paidAt), o.settings)
      return {
        name: displayReferralName(user),
        email: maskEmail(user.email),
        registeredAt: user.createdAt.toISOString(),
        paidAt: paidAt?.toISOString() ?? null,
        status: reward.status,
        label: reward.label,
        description: reward.description,
      }
    }),
  })
})
