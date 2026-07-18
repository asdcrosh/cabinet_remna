import Link from 'next/link'
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
        <Link href="/dashboard/support" className="btn-primary w-full sm:w-auto">Открыть поддержку</Link>
      </LegalSection>

      <LegalSection title="Email">
        <p>Поддержка, возвраты, претензии и вопросы по персональным данным: <a className="text-brand-600 hover:underline" href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>.</p>
        <p>Пишите с email, привязанного к аккаунту. Укажите тему, идентификатор платежа или обращения, если он есть. Не отправляйте пароль, CVC/CVV и полный номер карты.</p>
      </LegalSection>

      {(legal.supportPhone || legal.supportTelegram) && (
        <LegalSection title="Дополнительные каналы">
          {legal.supportPhone && <p>Телефон: <a className="text-brand-600 hover:underline" href={`tel:${legal.supportPhone.replace(/[^+\d]/g, '')}`}>{legal.supportPhone}</a>.</p>}
          {legal.supportTelegram && telegramUsername && <p>Telegram: <a className="text-brand-600 hover:underline" href={`https://t.me/${telegramUsername}`} rel="noreferrer" target="_blank">{legal.supportTelegram}</a>.</p>}
        </LegalSection>
      )}

      <LegalSection title="Исполнитель и оператор данных">
        <p>{legal.operatorName}, ИНН {legal.taxId}.</p>
        {legal.address && <p>Адрес: {legal.address}.</p>}
      </LegalSection>
    </LegalPage>
  )
}
