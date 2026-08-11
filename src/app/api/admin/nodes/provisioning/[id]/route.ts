import { NextResponse } from 'next/server'
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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth(async (_request: Request, { params }: RouteContext) => {
  await requireSuperAdmin()
  const { id } = await params
  const job = await getNodeProvisioningJob(id)
  if (!job) return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 })
  return NextResponse.json({ job: serializeNodeProvisioningJob(job) })
})

export const POST = withAuth(async (request: Request, { params }: RouteContext) => {
  const session = await requireSuperAdmin()
  const { id } = await params
  try {
    const job = await retryNodeProvisioningJob(id)
    await writeAuditLog({
      actorId: session.uid,
      action: 'ADMIN_NODE_PROVISIONING_RETRIED',
      message: 'Повторно запущена установка Remnawave-ноды',
      metadata: { entityType: 'nodeProvisioningJob', jobId: id },
      request,
    })
    return NextResponse.json({ job: serializeNodeProvisioningJob(job) }, { status: 202 })
  } catch (error) {
    if (error instanceof NodeProvisioningNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof NodeProvisioningConflictError) {
      return NextResponse.json({ error: error.message, jobId: error.jobId }, { status: 409 })
    }
    if (error instanceof NodeProvisioningStateError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Для этого IP или домена уже выполняется задача' }, { status: 409 })
    }
    throw error
  }
})
