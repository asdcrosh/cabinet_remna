import { describe, expect, it } from 'vitest'
import { createApiErrorReport, formatAdminErrorReport } from './admin-error-report'

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
})
