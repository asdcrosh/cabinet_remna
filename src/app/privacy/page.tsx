import { getBrandName } from '@/lib/branding'
import { getLegalDetails } from '@/lib/legal'
import { LegalPage, LegalSection } from '@/components/legal/legal-page'

export const metadata = { title: 'Политика конфиденциальности' }
export const dynamic = 'force-dynamic'

export default function PrivacyPage() {
  const brandName = getBrandName()
  const legal = getLegalDetails()

  return (
    <LegalPage
      activePath="/privacy"
      backHref="/"
      backLabel="На главную"
      brandName={brandName}
      description="Какие данные использует сервис, зачем они нужны и как управлять своими данными."
      supportEmail={legal.supportEmail}
      title="Политика конфиденциальности"
      updatedAt="14 июля 2026 года"
    >
        <LegalSection title="Какие данные обрабатываются">
          <p>Данные аккаунта и связи: email, имя, Telegram ID и имя пользователя при привязке. Также обрабатываются сведения о тарифах, платежах, подписках, обращениях в поддержку и технические данные запросов, включая IP-адрес и user-agent.</p>
          <p>Реквизиты банковской карты обрабатывает платёжный провайдер. Сервис не получает и не хранит полный номер карты и CVC/CVV.</p>
        </LegalSection>
        <LegalSection title="Цели и основания">
          <p>Данные нужны для регистрации и защиты аккаунта, исполнения оплаченной услуги, выдачи VPN-доступа, поддержки, предотвращения злоупотреблений, ведения обязательного учёта и отправки сервисных уведомлений.</p>
        </LegalSection>
        <LegalSection title="Передача и хранение">
          <p>В необходимом объёме данные могут передаваться платёжному провайдеру, сервисам email и Telegram, а также системам управления подпиской и VPN-инфраструктурой. Данные хранятся не дольше, чем требуют цели обработки, безопасность и применимые обязательства.</p>
        </LegalSection>
        <LegalSection title="Права пользователя">
          <p>Пользователь может запросить сведения об обработке, уточнение или удаление данных, если их хранение больше не требуется по закону или для исполнения договора. Запрос направляется на <a className="text-brand-600 hover:underline" href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>.</p>
        </LegalSection>
        <LegalSection title="Оператор">
          <p>
            {legal.operatorName}, ИНН {legal.taxId}.
            {legal.address && <> Адрес: {legal.address}.</>}
          </p>
        </LegalSection>
    </LegalPage>
  )
}
