import Link from 'next/link'
import { GitMerge, SearchCheck } from 'lucide-react'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { findIdentityDuplicateCandidates } from '@/lib/identity-duplicates'
import { PageHeader } from '@/components/dashboard/page-header'
import { DuplicateMergeButton } from '@/components/admin/duplicate-merge-button'
import { AdminEmptyState } from '@/components/admin/admin-empty-state'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Возможные дубли — Админка' }

export default async function AdminDuplicatesPage() {
  await requireAdminPage()
  const candidates = await findIdentityDuplicateCandidates()

  return (
    <div className="page-stack">
      <PageHeader
        title="Возможные дубли"
        description="Аккаунты с похожими данными"
        action={candidates.length > 0 ? <span className="badge-muted">Найдено: {candidates.length}</span> : null}
      />

      {candidates.length === 0 ? (
        <AdminEmptyState
          title="Подозрительных дублей нет"
          description="Если пользователь жалуется на разные кабинеты, используйте поиск в пользователях."
          icon={<SearchCheck className="h-7 w-7 text-emerald-600" />}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-200 dark:border-white/10 dark:bg-white/[0.025] dark:divide-white/[0.07]">
          {candidates.map((candidate) => (
            <article key={`${candidate.technicalUserId}:${candidate.emailUserId}`} className="p-4">
              <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <div className="grid min-w-0 gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
                  <IdentityBox
                    title="Telegram-аккаунт"
                    email={candidate.technicalEmail}
                    name={candidate.technicalName}
                    meta={candidate.technicalTelegramId ? `TG ${candidate.technicalTelegramId.toString()}` : 'без TG'}
                  />
                  <div className="hidden justify-center text-slate-400 md:flex">
                    <GitMerge className="h-5 w-5" />
                  </div>
                  <IdentityBox
                    title="Email-аккаунт"
                    email={candidate.email}
                    name={candidate.emailName}
                    meta={candidate.createdDistanceMinutes != null ? `${candidate.createdDistanceMinutes} мин. между регистрациями` : 'похожий профиль'}
                  />
                </div>
                <div className="grid w-full grid-cols-2 gap-2 2xl:w-auto 2xl:shrink-0">
                  <Link href={`/dashboard/admin/users?q=${encodeURIComponent(candidate.email)}`} className="btn-secondary min-h-11 justify-center px-3">
                    Открыть
                  </Link>
                  <DuplicateMergeButton
                    sourceUserId={candidate.technicalUserId}
                    targetUserId={candidate.emailUserId}
                    sourceEmail={candidate.technicalEmail}
                    targetEmail={candidate.email}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function IdentityBox({
  title,
  email,
  name,
  meta,
}: {
  title: string
  email: string
  name: string | null
  meta: string
}) {
  return (
    <div className="min-w-0 px-1 py-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{title}</div>
      <div className="mt-1 truncate font-semibold text-slate-950 dark:text-white">{email}</div>
      <div className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{name || 'имя не указано'} · {meta}</div>
    </div>
  )
}
