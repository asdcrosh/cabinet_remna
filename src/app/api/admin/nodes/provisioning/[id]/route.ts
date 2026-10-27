import { jsonResponse } from '@/lib/json-response'
import { Prisma } from '@prisma/client'
import { requireSuperAdmin, withAuth } from '@/lib/auth/guard'
import { writeAuditLog } from '@/lib/audit-log'
import {
  getNodeProvisioningJob,
  NodeProvisioningConflictError,
  NodeProvisioningNotFoundError,
  NodeProvisioningStateError,
  retryNodeProvisioningJob,
  serializeNodeProvisioningJob,
} from '@/lib/node-provisioning'
import { retryNodeProvisioningSchema } from '@/lib/node-provisioning-validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth(async (_request: Request, { params }: RouteContext) => {
  await requireSuperAdmin()
  const { id } = await params
  const job = await getNodeProvisioningJob(id)
  if (!job) return jsonResponse({ error: 'Задача не найдена' }, { status: 404 })
  return jsonResponse({ job: serializeNodeProvisioningJob(job) })
})

export const POST = withAuth(async (request: Request, { params }: RouteContext) => {
  const session = await requireSuperAdmin()
  const { id } = await params
  const parsed = retryNodeProvisioningSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonResponse({ error: 'Проверьте SSH-пользователя и пароль' }, { status: 400 })
  }
  const credentials = parsed.data.sshUser && parsed.data.sshPassword
    ? { sshUser: parsed.data.sshUser, sshPassword: parsed.data.sshPassword }
    : undefined
  try {
    const job = await retryNodeProvisioningJob(id, credentials)
    await writeAuditLog({
      actorId: session.uid,
      action: 'ADMIN_NODE_PROVISIONING_RETRIED',
      message: 'Повторно запущена установка Remnawave-ноды',
      metadata: { entityType: 'nodeProvisioningJob', jobId: id, credentialsUpdated: Boolean(credentials) },
      request,
    })
    return jsonResponse({ job: serializeNodeProvisioningJob(job) }, { status: 202 })
  } catch (error) {
    if (error instanceof NodeProvisioningNotFoundError) {
      return jsonResponse({ error: error.message }, { status: 404 })
    }
    if (error instanceof NodeProvisioningConflictError) {
      return jsonResponse({ error: error.message, jobId: error.jobId }, { status: 409 })
    }
    if (error instanceof NodeProvisioningStateError) {
      return jsonResponse({ error: error.message }, { status: 409 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return jsonResponse({ error: 'Для этого IP или домена уже выполняется задача' }, { status: 409 })
    }
    throw error
  }
})
