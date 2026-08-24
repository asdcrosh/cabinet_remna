import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireSuperAdmin, withAuth } from '@/lib/auth/guard'
import { writeAuditLog } from '@/lib/audit-log'
import {
  inspectNodeProvisioningSshHostKey,
  NodeProvisioningConflictError,
  NodeProvisioningNotFoundError,
  NodeProvisioningStateError,
  serializeNodeProvisioningJob,
  trustNodeProvisioningSshHostKeyAndRetry,
} from '@/lib/node-provisioning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth(async (_request: Request, { params }: RouteContext) => {
  await requireSuperAdmin()
  const { id } = await params
  try {
    return NextResponse.json({ inspection: await inspectNodeProvisioningSshHostKey(id) })
  } catch (error) {
    return handleError(error)
  }
})

export const PATCH = withAuth(async (request: Request, { params }: RouteContext) => {
  const session = await requireSuperAdmin()
  const { id } = await params
  const body = await request.json().catch(() => null) as { fingerprint?: unknown } | null
  if (typeof body?.fingerprint !== 'string') {
    return NextResponse.json({ error: 'Укажите проверенный SSH host key fingerprint' }, { status: 400 })
  }

  try {
    const job = await trustNodeProvisioningSshHostKeyAndRetry(id, body.fingerprint)
    await writeAuditLog({
      actorId: session.uid,
      action: 'ADMIN_NODE_PROVISIONING_RETRIED',
      message: 'Подтверждён новый SSH host key переустановленной Remnawave-ноды',
      metadata: { entityType: 'nodeProvisioningJob', jobId: id, fingerprint: body.fingerprint },
      request,
    })
    return NextResponse.json({ job: serializeNodeProvisioningJob(job) }, { status: 202 })
  } catch (error) {
    return handleError(error)
  }
})

function handleError(error: unknown) {
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
