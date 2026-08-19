import { describe, expect, it } from 'vitest'
import { conversionPercent } from './product-analytics'

describe('conversionPercent', () => {
  it('считает конверсию с одним знаком после запятой', () => {
    expect(conversionPercent(7, 12)).toBe(58.3)
  })

  it('возвращает ноль для пустой базы', () => {
    expect(conversionPercent(3, 0)).toBe(0)
  })
})
