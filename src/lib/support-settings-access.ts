// Кто может менять шаблоны ответов и SLA поддержки.
// Источник правды — requireAdmin в PATCH /api/admin/system/support: ADMIN и SUPER_ADMIN.
// Модераторы работают с обращениями, но настройки поддержки не меняют — как и раньше,
// когда эти настройки были только в «Система → Настройки».

export const SUPPORT_SETTINGS_EDITOR_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const

export function canEditSupportSettings(role: string | null | undefined) {
  return SUPPORT_SETTINGS_EDITOR_ROLES.some((editorRole) => editorRole === role)
}

/** Ссылка, которая открывает Поддержку сразу с окном «Шаблоны и SLA». */
export const SUPPORT_SETTINGS_HREF = '/dashboard/admin/support?settings=1'

export function shouldOpenSupportSettings(value: string | null | undefined, role: string | null | undefined) {
  return value === '1' && canEditSupportSettings(role)
}
