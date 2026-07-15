import { getBrandName } from '@/lib/branding'
import { getLegalDetails } from '@/lib/legal'
import { LegalPage, LegalSection } from '@/components/legal/legal-page'

export const metadata = { title: 'Правила возврата' }
export const dynamic = 'force-dynamic'

export default function RefundsPage() {
  const brandName = getBrandName()
  const legal = getLegalDetails()

  return (
    <LegalPage
      activePath="/refunds"
      backHref="/"
      backLabel="На главную"
      brandName={brandName}
      description="Условия обращения, порядок проверки и способ возврата оплаты."
      supportEmail={legal.supportEmail}
      title="Правила возврата"
      updatedAt="14 июля 2026 года"
    >
        <LegalSection title="Когда можно запросить возврат">
          <p>Запрос рассматривается, если оплата подтверждена, но доступ не был выдан по технической причине либо существенная неисправность сервиса не была устранена в разумный срок.</p>
        </LegalSection>
        <LegalSection title="Когда возврат может быть ограничен">
          <p>Возврат может быть отклонён полностью или частично, если доступ уже был выдан и использован, срок тарифа истёк, пользователь нарушил условия сервиса или проблема вызвана его устройством, сетью либо сторонним сервисом.</p>
        </LegalSection>
        <LegalSection title="Как подать запрос">
          <p>Напишите на <a className="text-brand-600 hover:underline" href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a> с email аккаунта. Укажите идентификатор платежа, дату, сумму и описание проблемы. Не отправляйте реквизиты банковской карты.</p>
        </LegalSection>
        <LegalSection title="Срок и способ возврата">
          <p>После проверки решение сообщается по email. Одобренный возврат отправляется через исходный способ оплаты. Фактический срок зачисления зависит от платёжного провайдера и банка.</p>
        </LegalSection>
        <LegalSection title="Исполнитель">
          <p>
            {legal.operatorName}, ИНН {legal.taxId}.
            {legal.address && <> Адрес: {legal.address}.</>}
          </p>
        </LegalSection>
    </LegalPage>
  )
}
