import { notFound, redirect } from 'next/navigation'
import {
  UsersRound,
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/cookies'
import {
  displayReferralName,
  formatReferralDate,
  getReferralOverview,
  getReferralStatus,
  maskEmail,
  referralConditionText,
  referralPaidAt,
  REFERRALS_PAGE_SIZE,
} from '@/lib/referral-overview'
import { ReferralLinkCard } from '@/components/dashboard/referral-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { CountUp } from '@/components/dashboard/count-up'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Пригласить друга' }

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  if (!await isFeatureEnabled('referrals')) notFound()
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const params = await searchParams
  const requestedPage = Number(params.page)
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1

  const {
    settings,
    referralCode,
    referralUrl,
    invitedCount,
    paidCount,
    appliedDays,
    pendingDays,
    conversion,
    pages,
    referrals,
  } = await getReferralOverview(session.uid, page)
  if (page > pages) redirect(page === 1 ? '/dashboard/referrals' : `/dashboard/referrals?page=${pages}`)

  return (
    <div className="page-stack">
      <PageHeader
        title="Пригласить друга"
        description={`Поделитесь ссылкой. ${referralConditionText(settings)}`}
      />

      <section id="referral-link" className="min-w-0 scroll-mt-24">
        <ReferralLinkCard code={referralCode} url={referralUrl} settings={settings} />
      </section>

      <section className="grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.035] sm:grid-cols-4">
        <SummaryCard label="Приглашено" value={invitedCount} />
        <SummaryCard label="Оплатили" value={paidCount} />
        <SummaryCard label="Конверсия" value={`${conversion}%`} />
        <SummaryCard
          label="Дней начислено"
          value={`+${appliedDays}`}
          hint={pendingDays > 0 ? `+${pendingDays} дн. ожидают` : undefined}
        />
      </section>

      <section id="referral-history" className="scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold sm:text-xl">Приглашённые</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Кто зарегистрировался и когда начислится бонус.</p>
          </div>
          {invitedCount > 0 && <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-white/10 dark:text-slate-300">{(page - 1) * REFERRALS_PAGE_SIZE + 1}–{Math.min(page * REFERRALS_PAGE_SIZE, invitedCount)} из {invitedCount}</div>}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
          {referrals.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                <UsersRound className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-semibold">Приглашений пока нет</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                Поделитесь ссылкой выше, и первые регистрации появятся здесь.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/10">
              {referrals.map((user) => {
                const paidAt = referralPaidAt(user)
                const reward = getReferralStatus(user.referralRewardAsReferred, Boolean(paidAt), settings)
                return (
                  <article key={user.id} className="grid gap-3 px-3 py-3 sm:px-4 md:grid-cols-[minmax(0,1fr)_8rem_8rem_10rem] md:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                          <UsersRound className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{displayReferralName(user)}</div>
                          <div className="truncate text-xs text-slate-500">{maskEmail(user.email)}</div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:contents">
                      <HistoryCell label="Регистрация" value={formatReferralDate(user.createdAt)} />
                      <HistoryCell label="Оплата" value={paidAt ? formatReferralDate(paidAt) : 'Ожидаем'} />
                    </div>
                    <div className="min-w-0 rounded-xl bg-slate-50 p-2.5 dark:bg-white/5 md:bg-transparent md:p-0 md:text-right md:dark:bg-transparent">
                      <span className={`badge-${reward.tone}`}>{reward.label}</span>
                      <div className="mt-1 line-clamp-2 text-xs text-slate-500">{reward.description}</div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
        {pages > 1 && (
          <nav className="mt-3 grid grid-cols-3 items-center" aria-label="Страницы приглашённых">
            {page > 1
              ? <a href={page === 2 ? '/dashboard/referrals' : `/dashboard/referrals?page=${page - 1}`} className="btn-secondary min-h-10 justify-self-start px-3 py-2">Назад</a>
              : <span />}
            <span className="text-center text-xs font-medium text-slate-500">{page} из {pages}</span>
            {page < pages
              ? <a href={`/dashboard/referrals?page=${page + 1}`} className="btn-secondary min-h-10 justify-self-end px-3 py-2">Дальше</a>
              : <span />}
          </nav>
        )}
      </section>
    </div>
  )
}

function SummaryCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  const count = parseCountValue(value)

  return (
    <div className="min-w-0 border-b border-r border-slate-100 p-3 last:border-r-0 dark:border-white/10 sm:border-b-0 sm:p-4">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
        {count ? <CountUp value={count.value} prefix={count.prefix} suffix={count.suffix} /> : value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  )
}

function parseCountValue(value: string | number) {
  if (typeof value === 'number') return { value, prefix: '', suffix: '' }
  const match = value.match(/^([+]?)(\d+)(.*)$/)
  if (!match) return null
  return {
    prefix: match[1] ?? '',
    value: Number(match[2]),
    suffix: match[3] ?? '',
  }
}

function HistoryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 py-1 md:p-0">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  )
}

