import { describe, expect, it } from 'vitest'
import { statusFromIssues, type SubscriptionHealthIssue } from './subscription-health'

function issue(severity: SubscriptionHealthIssue['severity']): SubscriptionHealthIssue {
  return {
    code: `TEST_${severity}`,
    severity,
    source: 'CABINET',
    title: 'Проверка',
    detail: 'Тестовое расхождение',
    repair: 'AUTO',
  }
}

describe('statusFromIssues', () => {
  it('returns HEALTHY when no issues exist', () => {
    expect(statusFromIssues([], null)).toBe('HEALTHY')
  })

  it('returns WARNING for non-critical mismatches', () => {
    expect(statusFromIssues([issue('WARNING')], null)).toBe('WARNING')
  })

  it('returns ERROR for critical issues or failed repairs', () => {
    expect(statusFromIssues([issue('ERROR')], null)).toBe('ERROR')
    expect(statusFromIssues([], 'Remnawave недоступен')).toBe('ERROR')
  })
})
