import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowUpRight, Headphones, Mail, MessageCircle, Phone, ShieldCheck } from 'lucide-react'
import { getBrandName } from '@/lib/branding'
import { getLegalDetails, LEGAL_UPDATED_AT } from '@/lib/legal'
import { LegalPage, LegalSection } from '@/components/legal/legal-page'

export const metadata = { title: 'Контакты и обратная связь' }
export const dynamic = 'force-dynamic'

export default function ContactsPage() {
  const brandName = getBrandName()
  const legal = getLegalDetails()
  const telegramUsername = legal.supportTelegram?.slice(1)

  return (
    <LegalPage
      activePath="/contacts"
      backHref="/"
      backLabel="На главную"
      brandName={brandName}
      description="Поддержка, обращения по оплате и запросы по персональным данным."
      supportEmail={legal.supportEmail}
      title="Контакты и обратная связь"
      updatedAt={LEGAL_UPDATED_AT}
    >
      <LegalSection title="Поддержка в личном кабинете">
        <p>Авторизованные пользователи могут создать обращение и отслеживать ответ в разделе поддержки.</p>
        <Link
          href="/dashboard/support"
          className="group flex min-h-16 items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 dark:bg-slate-950/10">
            <Headphones className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-white/60 dark:text-slate-500">Личный кабинет</span>
            <span className="block font-semibold">Открыть поддержку</span>
          </span>
          <ArrowUpRight className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </LegalSection>

      <LegalSection title="Email">
        <ContactAction
          href={`mailto:${legal.supportEmail}`}
          icon={<Mail className="h-5 w-5" />}
          label="Поддержка, возвраты и персональные данные"
          value={legal.supportEmail}
        />
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-3.5 py-3 dark:border-amber-500/20 dark:bg-amber-500/[0.06]">
          <p>Пишите с email, привязанного к аккаунту. Укажите тему, идентификатор платежа или обращения, если он есть. Не отправляйте пароль, CVC/CVV и полный номер карты.</p>
        </div>
      </LegalSection>

      {(legal.supportPhone || legal.supportTelegram) && (
        <LegalSection title="Дополнительные каналы">
          <div className="grid gap-2 sm:grid-cols-2">
            {legal.supportPhone && (
              <ContactAction
                href={`tel:${legal.supportPhone.replace(/[^+\d]/g, '')}`}
                icon={<Phone className="h-5 w-5" />}
                label="Телефон"
                value={legal.supportPhone}
              />
            )}
            {legal.supportTelegram && telegramUsername && (
              <ContactAction
                href={`https://t.me/${telegramUsername}`}
                icon={<MessageCircle className="h-5 w-5" />}
                label="Telegram"
                value={legal.supportTelegram}
                newTab
              />
            )}
          </div>
        </LegalSection>
      )}

      <LegalSection title="Исполнитель и оператор данных">
        <div className="flex gap-3 rounded-2xl bg-slate-50 p-3.5 dark:bg-white/[0.035]">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-slate-900 dark:text-white">{legal.operatorName}, ИНН {legal.taxId}.</p>
            {legal.address && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Адрес: {legal.address}.</p>}
          </div>
        </div>
      </LegalSection>
    </LegalPage>
  )
}

function ContactAction({
  href,
  icon,
  label,
  value,
  newTab = false,
}: {
  href: string
  icon: ReactNode
  label: string
  value: string
  newTab?: boolean
}) {
  return (
    <a
      href={href}
      rel={newTab ? 'noreferrer' : undefined}
      target={newTab ? '_blank' : undefined}
      className="group flex min-h-16 min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 transition-colors hover:border-cyan-200 hover:bg-cyan-50/60 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-cyan-400/30 dark:hover:bg-cyan-400/[0.08]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-cyan-700 shadow-sm dark:bg-white/[0.06] dark:text-cyan-200 dark:shadow-none">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-slate-500 dark:text-slate-400">{label}</span>
        <span className="block break-words text-sm font-semibold text-slate-900 dark:text-white">{value}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-cyan-600" />
    </a>
  )
}
