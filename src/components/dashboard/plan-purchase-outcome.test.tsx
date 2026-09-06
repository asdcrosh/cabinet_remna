import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PlanPurchaseOutcome } from './plan-purchase-outcome'
import { PlanCard, type PlanCardProps } from './plan-card'

const plan: PlanCardProps = {
  id: 'test-plan', name: 'Стандарт', description: null, price: '130 ₽',
  priceKopecks: 13000, monthlyPrice: '557 ₽', savingsPercent: 0,
  durationDays: 7, unlimitedDuration: false, trafficLimitGb: null,
  deviceLimit: 5, unlimitedDevices: false, maxDeviceLimit: 20,
  deviceAddonEnabled: true, extraDevicePriceKopecks: 10000,
  paymentProviders: [{ id: 'YOOKASSA', label: 'ЮKassa' }],
}

describe('объяснение покупки тарифа', () => {
  it('различает продление и смену тарифа', () => {
    const renewal = renderToStaticMarkup(<PlanPurchaseOutcome {...plan} current />)
    const change = renderToStaticMarkup(<PlanPurchaseOutcome {...plan} isPlanSwitch currentPlanName="Старый" />)
    expect(renewal).toContain('добавится 7 дн.')
    expect(change).toContain('Неиспользованные дни не переносятся')
    expect(change).not.toContain('добавится')
  })

  it('для бессрочного доступа не обещает прибавить дни', () => {
    const html = renderToStaticMarkup(<PlanPurchaseOutcome {...plan} current unlimitedDuration />)
    expect(html).toContain('Продление не потребуется')
    expect(html).not.toContain('добавится')
  })

  it('показывает предупреждение о смене тарифа и на мобильном оформлении', () => {
    const html = renderToStaticMarkup(<PlanCard {...plan} display="checkout" isPlanSwitch currentPlanName="Старый" />)
    expect(html).toContain('Вы меняете тариф')
    expect(html).toContain('Неиспользованные дни не переносятся')
    expect(html.indexOf('Неиспользованные дни не переносятся')).toBeLessThan(html.indexOf('Промокод'))
  })

  it('включает устройства, персональную скидку и белые списки в полную сумму', () => {
    const html = renderToStaticMarkup(<PlanCard {...plan} display="checkout" initialDeviceLimit={8}
      personalDiscountPercent={10} whitelistAddonEnabled whitelistAddonPriceKopecks={7000}
      autoRenewalEnabled autoRenewalWhitelistAddonEnabled />)
    // 130 + 300 - 13 + 70 = 487: персональная скидка применяется к базовому тарифу.
    const summary = html.slice(html.indexOf('aria-label="Состав оплаты"'))
    expect(summary).toContain('Дополнительные устройства · 3')
    expect(summary).toContain('−13 ₽')
    expect(summary).toContain('+70 ₽')
    expect(summary).toContain('487 ₽')
    expect(html.slice(0, html.indexOf('Итоговая сумма'))).toContain('487 ₽')
  })
})
