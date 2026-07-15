import Link from 'next/link'
import { AlertTriangle, GitMerge, SearchCheck } from 'lucide-react'
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
        description="Технические Telegram-аккаунты, похожие на email-аккаунты"
      />

      <section className="panel panel-pad">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200">
              <SearchCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-slate-950 dark:text-white">Проверка дублей</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Автоматическое объединение выполняется только в безопасных сценариях. Здесь список для ручной проверки.
              </p>
            </div>
          </div>
          <span className="badge bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
            {candidates.length} найдено
          </span>
        </div>
      </section>

      {candidates.length === 0 ? (
        <AdminEmptyState
          title="Подозрительных дублей нет"
          description="Если пользователь жалуется на разные кабинеты, используйте поиск в пользователях."
          icon={<SearchCheck className="h-7 w-7 text-emerald-600" />}
        />
      ) : (
        <div className="grid gap-3">
          {candidates.map((candidate) => (
            <article key={`${candidate.technicalUserId}:${candidate.emailUserId}`} className="surface-card">
              <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <div className="grid min-w-0 gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
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
                  <span className="col-span-2 inline-flex items-center justify-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    одинаковое имя
                  </span>
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
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{title}</div>
      <div className="mt-1 truncate font-semibold text-slate-950 dark:text-white">{email}</div>
      <div className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{name || 'имя не указано'} · {meta}</div>
    </div>
  )
}
