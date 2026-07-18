import { afterEach, describe, expect, it } from 'vitest'
import { getLegalDetails } from './legal'

describe('legal details', () => {
  afterEach(() => {
    delete process.env.LEGAL_OPERATOR_NAME
    delete process.env.LEGAL_OPERATOR_TAX_ID
    delete process.env.LEGAL_OPERATOR_ADDRESS
    delete process.env.LEGAL_SUPPORT_EMAIL
    delete process.env.LEGAL_SUPPORT_PHONE
    delete process.env.LEGAL_SUPPORT_TELEGRAM
  })

  it('keeps the address optional for a self-employed operator', () => {
    process.env.LEGAL_OPERATOR_NAME = 'Иванов Иван Иванович'
    process.env.LEGAL_OPERATOR_TAX_ID = '123456789012'
    process.env.LEGAL_OPERATOR_ADDRESS = '   '
    process.env.LEGAL_SUPPORT_EMAIL = 'support@example.ru'

    expect(getLegalDetails()).toEqual({
      operatorName: 'Иванов Иван Иванович',
      taxId: '123456789012',
      address: null,
      supportEmail: 'support@example.ru',
      supportPhone: null,
      supportTelegram: null,
    })
  })

  it('trims an explicitly configured address', () => {
    process.env.LEGAL_OPERATOR_ADDRESS = '  г. Москва  '

    expect(getLegalDetails().address).toBe('г. Москва')
  })

  it('normalizes optional public contacts', () => {
    process.env.LEGAL_SUPPORT_PHONE = '  +7 900 000-00-00 '
    process.env.LEGAL_SUPPORT_TELEGRAM = 'https://t.me/example_support'

    expect(getLegalDetails()).toMatchObject({
      supportPhone: '+7 900 000-00-00',
      supportTelegram: '@example_support',
    })
  })
})
