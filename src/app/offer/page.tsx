import Link from 'next/link'
import { getBrandName } from '@/lib/branding'
import { getLegalDetails, OFFER_UPDATED_AT } from '@/lib/legal'
import { LegalPage, LegalSection } from '@/components/legal/legal-page'

export const metadata = { title: 'Публичная оферта' }
export const dynamic = 'force-dynamic'

export default function OfferPage() {
  const brandName = getBrandName()
  const legal = getLegalDetails()

  return (
    <LegalPage
      activePath="/offer"
      backHref="/dashboard"
      backLabel="В кабинет"
      brandName={brandName}
      description="Условия покупки, оплаты и предоставления доступа к сервису."
      supportEmail={legal.supportEmail}
      title="Публичная оферта"
      updatedAt={OFFER_UPDATED_AT}
    >
      {/* <LegalSection title="1. Статус документа">
        <p>
          Настоящий документ является публичной офертой {legal.operatorName}, ИНН {legal.taxId},
          адресованной физическим лицам. Версия оферты: {OFFER_VERSION}.
        </p>
        {legal.address && <p>Адрес исполнителя: {legal.address}.</p>}
      </LegalSection> */}

      <LegalSection title="2. Предмет оферты">
        <p>
          Исполнитель предоставляет пользователю ограниченный по сроку доступ к
          программно-техническому сервису. Срок, стоимость, лимиты и количество устройств
          указываются в карточке выбранного тарифа до оплаты.
        </p>
      </LegalSection>

      <LegalSection title="3. Акцепт и заключение договора">
        <p>
          Полным и безоговорочным акцептом оферты является оплата выбранного тарифа.
          Договор считается заключённым после подтверждения оплаты платёжным провайдером.
        </p>
        <p>
          До оплаты пользователь должен ознакомиться с этой офертой,{' '}
          <Link className="text-brand-600 hover:underline" href="/terms">пользовательским соглашением</Link> и
          условиями выбранного тарифа.
        </p>
      </LegalSection>

      <LegalSection title="4. Стоимость и оплата">
        <p>
          Стоимость указывается в рублях в карточке тарифа. Оплата проводится через доступных
          в кабинете платёжных провайдеров. Исполнитель не хранит полный номер банковской карты
          и CVC/CVV.
        </p>
      </LegalSection>

      <LegalSection title="5. Предоставление доступа">
        <p>
          Доступ активируется автоматически после подтверждения оплаты. Статус оплаты и выдачи
          отображается в личном кабинете. При временной технической задержке выдача повторяется
          автоматически или вручную после обращения в поддержку.
        </p>
      </LegalSection>

      <LegalSection title="6. Права и обязанности">
        <p>
          Исполнитель обеспечивает доступ в пределах выбранного тарифа и принимает обращения
          по его работе. Пользователь указывает достоверные данные, обеспечивает сохранность аккаунта,
          соблюдает законодательство и не перепродаёт доступ без согласования.
        </p>
      </LegalSection>

      <LegalSection title="7. Отказ и возврат">
        <p>
          Запрос на возврат направляется по правилам, опубликованным на{' '}
          <Link className="text-brand-600 hover:underline" href="/refunds">странице возвратов</Link>. Сумма возврата
          определяется с учётом фактически оказанной части услуги, фактических расходов и требований
          закона.
        </p>
      </LegalSection>

      <LegalSection title="8. Ответственность">
        <p>
          Стороны несут ответственность в соответствии с законодательством. Исполнитель не отвечает за
          перерывы, вызванные авариями у независимых поставщиков, действиями органов власти или другими
          обстоятельствами вне разумного контроля, если иное не предусмотрено законом.
        </p>
      </LegalSection>

      <LegalSection title="9. Персональные данные">
        <p>
          Порядок обработки данных описан в{' '}
          <Link className="text-brand-600 hover:underline" href="/privacy">политике конфиденциальности</Link> и{' '}
          <Link className="text-brand-600 hover:underline" href="/consent">согласии на обработку персональных данных</Link>.
        </p>
      </LegalSection>

      <LegalSection title="10. Срок действия и изменение оферты">
        <p>
          Оферта действует с момента публикации до её отзыва или замены. К оплаченному тарифу
          применяется редакция, действовавшая в момент оплаты, если иное не следует из закона.
        </p>
      </LegalSection>

      <LegalSection title="11. Контакты">
        <p>
          Поддержка, возвраты и претензии:{' '}
          <a className="text-brand-600 hover:underline" href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>.
          {' '}Другие каналы указаны на{' '}
          <Link className="text-brand-600 hover:underline" href="/contacts">странице контактов</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
