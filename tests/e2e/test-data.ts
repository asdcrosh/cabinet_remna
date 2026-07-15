export const E2E_PASSWORD = 'E2ePassword123'

export const E2E_USERS = {
  basic: {
    id: 'e2e-basic-user',
    email: 'e2e-basic@example.test',
    name: 'E2E Пользователь',
  },
  expired: {
    id: 'e2e-expired-user',
    email: 'e2e-expired@example.test',
    name: 'E2E Истёкший',
    remnawaveUuid: 'e2e-expired-uuid',
    remnawaveShortUuid: 'e2e-expired-short',
    remnawaveUsername: 'e2e-expired',
  },
  admin: {
    id: 'e2e-admin-user',
    email: 'e2e-admin@example.test',
    name: 'E2E Администратор',
  },
} as const

export const E2E_PLAN_ID = 'e2e-expired-plan'
export const E2E_SUBSCRIPTION_ID = 'e2e-expired-subscription'
