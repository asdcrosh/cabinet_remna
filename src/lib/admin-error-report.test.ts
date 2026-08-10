import { describe, expect, it } from 'vitest'
import { createApiErrorReport, createRuntimeErrorReport, formatAdminErrorReport } from './admin-error-report'

describe('admin error report', () => {
  it('explains database permission errors and keeps the full request id', () => {
    const report = createApiErrorReport({
      method: 'DELETE',
      endpoint: 'https://cabinet.test/api/admin/users/user-1/plan?source=list',
      status: 500,
      statusText: 'Internal Server Error',
      requestId: '3b17bbfd-1234-4567-8901-123456789012',
      data: {
        error: 'Внутренняя ошибка сервера.',
        details: {
          reason: 'permission denied for table users',
          type: 'DatabaseError',
          code: '42501',
        },
      },
    })

    expect(report.endpoint).toBe('/api/admin/users/user-1/plan')
    expect(report.requestId).toBe('3b17bbfd-1234-4567-8901-123456789012')
    expect(report.explanation).toBe('permission denied for table users')
    expect(report.recommendations.join(' ')).toContain('GRANT')
    expect(formatAdminErrorReport(report)).toContain('ID запроса: 3b17bbfd-1234-4567-8901-123456789012')
  })

  it('turns an unavailable API into an actionable report', () => {
    const report = createApiErrorReport({
      method: 'POST',
      endpoint: '/api/admin/remnashop-sync',
      networkError: new TypeError('Failed to fetch'),
    })

    expect(report.title).toBe('Нет ответа от сервера')
    expect(report.message).toBe('Не удалось связаться с сервером.')
    expect(report.recommendations.join(' ')).toContain('REMNASHOP_API_URL')
  })

  it('explains a bonus antifraud block without blaming permissions', () => {
    const report = createApiErrorReport({
      method: 'POST',
      endpoint: '/api/bonus-box',
      status: 403,
      data: {
        error: 'Открытие временно остановлено для автоматической проверки',
        code: 'BONUS_RISK_REVIEW',
        score: 100,
      },
    })

    expect(report.title).toBe('Проверка бонусов')
    expect(report.explanation).toContain('Это не ошибка роли или Origin')
    expect(report.recommendations.join(' ')).toContain('Антифрод')
    expect(report.errorCode).toBe('BONUS_RISK_REVIEW')
  })

  it('keeps the production Server Components digest and explains how to find the cause', () => {
    const error = Object.assign(
      new Error('An error occurred in the Server Components render. The specific message is omitted in production builds.'),
      { digest: '1847362910' },
    )

    const report = createRuntimeErrorReport(error, 'interface', 'Администрирование')

    expect(report.message).toBe('Сервер не смог сформировать страницу.')
    expect(report.errorCode).toBe('1847362910')
    expect(report.explanation).toContain('digest 1847362910')
    expect(report.technicalDetails).toMatchObject({ digest: '1847362910' })
    expect(formatAdminErrorReport(report)).toContain('Код ошибки: 1847362910')
  })
})
