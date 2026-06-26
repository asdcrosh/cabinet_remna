import type { AuditAction, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logWarn } from '@/lib/logger'

interface WriteAuditLogInput {
  actorId?: string | null
  targetId?: string | null
  action: AuditAction
  message: string
  metadata?: Prisma.InputJsonValue
  request?: Request
}

export async function writeAuditLog(input: WriteAuditLogInput) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        targetId: input.targetId ?? null,
        action: input.action,
        message: input.message,
        metadata: input.metadata,
        ip: input.request ? getRequestIp(input.request) : null,
        userAgent: input.request?.headers.get('user-agent')?.slice(0, 500) ?? null,
      },
    })
  } catch (error) {
    logWarn('audit.write_failed', {
      action: input.action,
      actorId: input.actorId,
      targetId: input.targetId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim().slice(0, 80) || null
  return request.headers.get('x-real-ip')?.slice(0, 80) ?? null
}
