export const E2E_PASSWORD = 'E2ePassword123'

export const E2E_USERS = {
  basic: {
    id: 'e2e-basic-user',
    email: 'e2e-basic@example.test',
    name: 'E2E Пользователь',
  },
  password: {
    id: 'e2e-password-user',
    email: 'e2e-password@example.test',
    name: 'E2E Смена пароля',
  },
  expired: {
    id: 'e2e-expired-user',
    email: 'e2e-expired@example.test',
    name: 'E2E Истёкший',
    remnawaveUuid: 'e2e-expired-uuid',
    remnawaveShortUuid: 'e2e-expired-short',
    remnawaveUsername: 'e2e-expired',
  },
  active: {
    id: 'e2e-active-user',
    email: 'e2e-active@example.test',
    name: 'E2E Активный',
    remnawaveUuid: 'e2e-active-uuid',
    remnawaveShortUuid: 'e2e-active-short',
    remnawaveUsername: 'e2e-active',
  },
  admin: {
    id: 'e2e-admin-user',
    email: 'e2e-admin@example.test',
    name: 'E2E Администратор',
  },
} as const

export const E2E_PLAN_ID = 'e2e-expired-plan'
export const E2E_SUBSCRIPTION_ID = 'e2e-expired-subscription'
export const E2E_ACTIVE_SUBSCRIPTION_ID = 'e2e-active-subscription'
export const E2E_BONUS_PRIZE_IDS = {
  common: 'e2e-bonus-common',
  epic: 'e2e-bonus-epic',
} as const
