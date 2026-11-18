// Единые проверки ролей для интерфейса и бота.
// Серверные гарды (requireAdmin / requireStaff в guard.ts) остаются источником правды для API;
// эти функции нужны, чтобы интерфейс не показывал то, что сервер всё равно запретит.

export type AppRole = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'

/** Администратор: статистика, рассылки, панель управления. Совпадает с requireAdmin. */
export function isAdminRole(role: string | null | undefined): role is 'ADMIN' | 'SUPER_ADMIN' {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

/** Сотрудник: администратор или модератор поддержки. Совпадает с requireStaff. */
export function isStaffRole(role: string | null | undefined): role is 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN' {
  return role === 'MODERATOR' || isAdminRole(role)
}
