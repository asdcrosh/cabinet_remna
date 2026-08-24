import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getLegalDetails, getMainAdminEmail } from './legal'

describe('legal details', () => {
  beforeEach(() => {
    process.env.SUPERUSER_EMAIL = 'main.admin@example.ru'
    process.env.LEGAL_OPERATOR_NAME = 'Иванов Иван Иванович'
    process.env.LEGAL_OPERATOR_TAX_ID = '123456789012'
  })

  afterEach(() => {
    delete process.env.LEGAL_OPERATOR_NAME
    delete process.env.LEGAL_OPERATOR_TAX_ID
    delete process.env.LEGAL_OPERATOR_ADDRESS
    delete process.env.SUPERUSER_EMAIL
    delete process.env.LEGAL_SUPPORT_EMAIL
    delete process.env.LEGAL_SUPPORT_PHONE
    delete process.env.LEGAL_SUPPORT_TELEGRAM
  })

  it('keeps the address optional for a self-employed operator', () => {
    process.env.LEGAL_OPERATOR_NAME = 'Иванов Иван Иванович'
    process.env.LEGAL_OPERATOR_TAX_ID = '123456789012'
    process.env.LEGAL_OPERATOR_ADDRESS = '   '

    expect(getLegalDetails()).toEqual({
      operatorName: 'Иванов Иван Иванович',
      taxId: '123456789012',
      address: null,
      supportEmail: 'main.admin@example.ru',
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

  it('uses only the normalized main administrator email', () => {
    process.env.SUPERUSER_EMAIL = '  Main.Admin@Example.RU  '
    process.env.LEGAL_SUPPORT_EMAIL = 'wrong@example.test'

    expect(getMainAdminEmail()).toBe('main.admin@example.ru')
    expect(getLegalDetails().supportEmail).toBe('main.admin@example.ru')
  })

  it('fails closed when the main administrator email is missing', () => {
    delete process.env.SUPERUSER_EMAIL

    expect(() => getMainAdminEmail()).toThrow('SUPERUSER_EMAIL is required')
  })

  it('fails closed when the main administrator email is invalid', () => {
    process.env.SUPERUSER_EMAIL = 'not-an-email'

    expect(() => getMainAdminEmail()).toThrow('SUPERUSER_EMAIL must be a valid email')
  })
})
