import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { resolveSubscriptionPresentation } from '@/lib/subscription-presentation'
import { AUTO_RENEWAL_CONSENT_VERSION } from '@/lib/auto-renewal-consent'
import { BillingOverview } from './billing-overview'
import { PaymentHistory, type PaymentHistoryPayment } from './payment-history'
import { AutoRenewalCard } from './auto-renewal-card'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const state = resolveSubscriptionPresentation({
  localStatus: 'ACTIVE',
  localExpireAt: new Date('2030-05-19T12:00:00Z'),
  now: new Date('2030-05-01T12:00:00Z'),
})
const overview = {
  planName: 'Стандарт', state, unlimitedDuration: false, unlimitedDevices: false,
  deviceLimit: 5, renewalPrice: 13000, durationDays: 7, includesAddon: false,
}

function payment(overrides: Partial<PaymentHistoryPayment> = {}): PaymentHistoryPayment {
  return {
    id: 'payment-full-identifier-123456789',
    status: 'PENDING',
    createdAt: new Date('2020-01-01T12:00:00Z'),
    confirmationUrl: 'https://example.test/pay',
    purchaseType: 'SUBSCRIPTION',
    provider: 'YOOKASSA',
    amountKopecks: 13000,
    originalAmountKopecks: null,
    discountKopecks: 0,
    deviceLimit: 5,
    planSnapshot: null,
    addonSnapshot: null,
    promoCodeSnapshot: null,
    subscriptionProvisionedAt: null,
    subscription: null,
    plan: { name: 'Стандарт', deviceLimit: 5, unlimitedDevices: false },
    ...overrides,
  } as PaymentHistoryPayment
}

describe('подписка и оплата', () => {
  it('показывает срок, устройства и стоимость продления вместе', () => {
    const html = renderToStaticMarkup(<BillingOverview {...overview} />)
    expect(html).toContain('130 ₽ за 7 дн.')
    expect(html).toContain('До 5 одновременно')
    expect(html).toContain('19 мая 2030')
    expect(html).toContain('/dashboard/plans?intent=renew')
    expect(html).toContain('Подключить VPN')
  })

  it('не выдаёт неизвестную стоимость за нулевую или базовую', () => {
    const html = renderToStaticMarkup(<BillingOverview {...overview} renewalPrice={null} />)
    expect(html).toContain('Уточняется при выборе тарифа')
    expect(html).not.toContain('₽')
  })

  it('для паузы показывает сохранённый срок и действие возобновления', () => {
    const html = renderToStaticMarkup(<BillingOverview {...overview} state={{ ...state, phase: 'paused', status: 'PAUSED', usable: false }} />)
    expect(html).toContain('Сохранён на паузе')
    expect(html).toContain('href="#auto-renewal"')
    expect(html).not.toContain('19 мая 2030')
    expect(html).not.toContain('Подключить VPN')
  })

  it('сначала проверяет старый незавершённый платёж', () => {
    const html = renderToStaticMarkup(<PaymentHistory payments={[payment()]} supportEnabled />)
    expect(html).toContain('payment=payment-full-identifier-123456789#payment-status')
    expect(html).toContain('Проверить статус')
    expect(html).not.toContain('Создать новый платёж')
    expect(html).not.toContain('https://example.test/pay')
    expect(html).toContain('Помощь с платежом')
  })

  it('позволяет продолжить свежий платёж и проверить его результат', () => {
    const html = renderToStaticMarkup(<PaymentHistory payments={[payment({ createdAt: new Date() })]} />)
    expect(html).toContain('Продолжить оплату')
    expect(html).toContain('https://example.test/pay')
    expect(html).toContain('Проверить статус')
  })

  it('не предлагает покупать заново при пустом фильтре', () => {
    const html = renderToStaticMarkup(<PaymentHistory payments={[]} filtered />)
    expect(html).toContain('В этом разделе платежей нет')
    expect(html).toContain('Вся история')
    expect(html).not.toContain('Выбрать тариф')
  })

  it('не помечает возвращённый платёж как выданную подписку', () => {
    const html = renderToStaticMarkup(<PaymentHistory payments={[payment({ status: 'REFUNDED', subscriptionProvisionedAt: new Date() })]} />)
    expect(html).toContain('Возврат оформлен')
    expect(html).not.toContain('Выдана')
    expect(html).toContain('payment-full-identifier-123456789')
  })

  it('сохраняет отвязку карты после окончания подписки', () => {
    const html = renderToStaticMarkup(<AutoRenewalCard
      planId="plan" planName="Стандарт" planPriceKopecks={13000} planDurationDays={7} planDeviceLimit={5}
      canEnable={false} canPause={false} initialPause={null}
      initialState={{
        id: 'renewal', plan: { id: 'plan', name: 'Стандарт', priceKopecks: 13000, durationDays: 7 },
        status: 'PAUSED', paymentMethodTitle: 'VISA •••• 4567', paymentMethodSavedAt: null,
        consentAcceptedAt: '2026-01-01T12:00:00Z', consentVersion: AUTO_RENEWAL_CONSENT_VERSION,
        consentPriceKopecks: 13000, consentDurationDays: 7, deviceLimit: 5, nextChargeAt: null,
        retryCount: 0, lastAttemptAt: null, lastSuccessAt: null, lastError: null,
      }}
    />)
    expect(html).toContain('Отключить и отвязать карту')
    expect(html).not.toContain('Поставить на паузу')
    expect(html).not.toContain('Подключить автопродление')
    expect(html).toContain('Не запланировано')
  })
})
