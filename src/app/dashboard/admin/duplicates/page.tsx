import Link from 'next/link'
import { AlertTriangle, GitMerge, SearchCheck } from 'lucide-react'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { findIdentityDuplicateCandidates } from '@/lib/identity-duplicates'
import { PageHeader } from '@/components/dashboard/page-header'
import { DuplicateMergeButton } from '@/components/admin/duplicate-merge-button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Возможные дубли — Админка' }

export default async function AdminDuplicatesPage() {
  await requireAdminPage()
  const candidates = await findIdentityDuplicateCandidates()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Возможные дубли"
        description="Технические Telegram-аккаунты, похожие на email-аккаунты"
      />

      <section className="panel panel-pad">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200">
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
        <section className="panel panel-pad py-12 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
            <SearchCheck className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Подозрительных дублей нет</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Если пользователь жалуется на разные кабинеты, используйте поиск в пользователях.</p>
        </section>
      ) : (
        <div className="grid gap-3">
          {candidates.map((candidate) => (
            <article key={`${candidate.technicalUserId}:${candidate.emailUserId}`} className="surface-card">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    одинаковое имя
                  </span>
                  <Link href={`/dashboard/admin/users?q=${encodeURIComponent(candidate.email)}`} className="btn-secondary h-9 px-3">
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
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{title}</div>
      <div className="mt-1 truncate font-semibold text-slate-950 dark:text-white">{email}</div>
      <div className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{name || 'имя не указано'} · {meta}</div>
    </div>
  )
}
