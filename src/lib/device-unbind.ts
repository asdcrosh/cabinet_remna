import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit-log'
import { hasRemnawaveUserReference, remnawave, RemnawaveError, remnawaveUserReference } from '@/lib/remnawave'

export type UnbindDeviceResult =
  | { ok: true; revokedSessions: number }
  | { ok: false; error: 'NOT_FOUND' | 'REMNAWAVE_UNAVAILABLE' }

// Отвязать устройство: HWID удаляется из Remnawave, место в лимите освобождается.
// Вход в приложение StealthNet на этом устройстве (сессии с тем же HWID) отзывается сразу.
// Это не блокировка: устройство может подключиться снова, если есть место.
export async function unbindUserDevice(input: { userId: string; hwid: string; request?: Request }): Promise<UnbindDeviceResult> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } })
  if (!user || !hasRemnawaveUserReference(user)) return { ok: false, error: 'NOT_FOUND' }

  const reference = remnawaveUserReference(user)
  try {
    const { response } = await remnawave.getUserDevices(reference)
    if (!response.devices.some((device) => device.hwid === input.hwid)) return { ok: false, error: 'NOT_FOUND' }
    await remnawave.deleteUserDevice(reference, input.hwid)
  } catch (e) {
    if (e instanceof RemnawaveError) return { ok: false, error: 'REMNAWAVE_UNAVAILABLE' }
    throw e
  }

  await prisma.device.deleteMany({ where: { userId: user.id, hwid: input.hwid } })
  const revoked = await prisma.mobileSession.updateMany({
    where: { userId: user.id, hwid: input.hwid, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: 'device_unbound' },
  })

  await writeAuditLog({
    actorId: user.id,
    targetId: user.id,
    action: 'USER_DEVICE_UNBOUND',
    message: 'Пользователь отвязал устройство',
    metadata: { hwid: input.hwid, revokedSessions: revoked.count },
    request: input.request,
  })
  return { ok: true, revokedSessions: revoked.count }
}
