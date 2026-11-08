// Пробный период в приложении StealthNet.
// На сайте пробный тариф доступен после привязки Telegram (защита от новых почт).
// В приложении Telegram не нужен: вместо него — один пробный на телефон по ключу устройства
// (SHA-256 от ANDROID_ID: не меняется при переустановке, меняется при сбросе телефона).
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

export const trialDeviceKeySchema = z.string().regex(/^[0-9a-f]{64}$/)

export function parseTrialDeviceKey(value: string | null | undefined) {
  const parsed = trialDeviceKeySchema.safeParse(value ?? '')
  return parsed.success ? parsed.data : null
}

/** Брали ли на этом телефоне пробный период (любым аккаунтом). */
export async function isTrialDeviceUsed(deviceKey: string) {
  const used = await prisma.trialPlanRedemption.findUnique({ where: { deviceKey }, select: { id: true } })
  return Boolean(used)
}
