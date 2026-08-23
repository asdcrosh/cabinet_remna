import { describe, expect, it } from 'vitest'
import {
  buildPlanPurchaseSnapshot,
  calculatePlanPurchase,
  DeviceLimitSelectionError,
  readPlanPurchaseSnapshot,
  resolveEffectiveDeviceLimit,
} from './plan-purchase'

const plan = {
  priceKopecks: 70_000,
  deviceLimit: 4,
  maxDeviceLimit: 20,
  extraDevicePriceKopecks: 10_000,
}

describe('calculatePlanPurchase', () => {
  it('keeps the base price for the included device count', () => {
    expect(calculatePlanPurchase(plan, 4)).toEqual({
      baseDeviceLimit: 4,
      maxDeviceLimit: 20,
      selectedDeviceLimit: 4,
      extraDeviceCount: 0,
      extraDeviceAmountKopecks: 0,
      originalAmountKopecks: 70_000,
    })
  })

  it('adds the configured price for every extra device', () => {
    expect(calculatePlanPurchase(plan, 8)).toMatchObject({
      selectedDeviceLimit: 8,
      extraDeviceCount: 4,
      extraDeviceAmountKopecks: 40_000,
      originalAmountKopecks: 110_000,
    })
  })

  it('rejects a value outside the tariff range', () => {
    expect(() => calculatePlanPurchase(plan, 3)).toThrow(DeviceLimitSelectionError)
    expect(() => calculatePlanPurchase(plan, 21)).toThrow('Выберите от 4 до 20 устройств')
  })

  it('keeps the live subscription limit for legacy payment snapshots', () => {
    expect(resolveEffectiveDeviceLimit({
      snapshot: { selectedDeviceLimit: 4, deviceLimitSelectionConfirmed: false },
      paymentDeviceLimit: 4,
      subscriptionDeviceLimit: 8,
      planDeviceLimit: 4,
    })).toBe(8)
  })

  it('records a tariff switch in the immutable purchase snapshot', () => {
    const pricedPlan = {
      id: 'new-plan',
      name: 'Новый',
      priceKopecks: 70_000,
      durationDays: 30,
      trafficLimitGb: null,
      deviceLimit: 4,
      maxDeviceLimit: 20,
      extraDevicePriceKopecks: 10_000,
      activeInternalSquads: ['new-squad'],
    }
    const snapshot = buildPlanPurchaseSnapshot(
      pricedPlan,
      calculatePlanPurchase(pricedPlan, 4),
      { id: 'old-plan', name: 'Старый' }
    )

    expect(readPlanPurchaseSnapshot(snapshot)?.switchFromPlan).toEqual({
      id: 'old-plan',
      name: 'Старый',
    })
  })
})
