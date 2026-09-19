import { prisma } from '@/lib/prisma'

export const DEFAULT_SUPPORT_QUICK_REPLIES = [
  'Проверяю и скоро вернусь с ответом.',
  'Готово, попробуйте подключиться ещё раз.',
  'Пришлите, пожалуйста, скрин ошибки и модель устройства.',
  'Проверил оплату. Если доступ не появился, нажмите синхронизацию в кабинете.',
  'Закрою обращение после вашего подтверждения, что всё работает.',
]

export interface SupportSettings {
  slaWarningMinutes: number
  slaBreachMinutes: number
  quickReplies: string[]
}

export function normalizeSupportSettings(input: Partial<Omit<SupportSettings, 'quickReplies'>> & { quickReplies?: unknown }): SupportSettings {
  const warning = normalizeMinutes(input.slaWarningMinutes, 240)
  const breach = Math.max(warning + 1, normalizeMinutes(input.slaBreachMinutes, 1440))
  const quickReplies = Array.isArray(input.quickReplies)
    ? Array.from(new Set(input.quickReplies
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)))
        .slice(0, 20)
    : []

  return {
    slaWarningMinutes: warning,
    slaBreachMinutes: breach,
    quickReplies: quickReplies.length > 0 ? quickReplies : DEFAULT_SUPPORT_QUICK_REPLIES,
  }
}

export async function getSupportSettings() {
  const settings = await prisma.supportSetting.findUnique({ where: { id: 'default' } })
  return normalizeSupportSettings(settings ?? {})
}

export async function updateSupportSettings(input: SupportSettings) {
  const settings = normalizeSupportSettings(input)
  const saved = await prisma.supportSetting.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...settings },
    update: settings,
  })
  return normalizeSupportSettings(saved)
}

function normalizeMinutes(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 5 && value <= 43_200
    ? value
    : fallback
}
