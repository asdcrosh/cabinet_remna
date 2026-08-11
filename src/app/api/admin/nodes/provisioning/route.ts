import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireSuperAdmin, withAuth } from '@/lib/auth/guard'
import { writeAuditLog } from '@/lib/audit-log'
import { rateLimit } from '@/lib/rate-limit'
import {
  createNodeProvisioningJob,
  getNodeProvisioningConfiguration,
  getNodeProvisioningTemplates,
  listNodeProvisioningJobs,
  NodeProvisioningConflictError,
  serializeNodeProvisioningJob,
} from '@/lib/node-provisioning'
import { createNodeProvisioningSchema } from '@/lib/node-provisioning-validation'
import { getWorkerHeartbeat } from '@/lib/worker-health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  await requireSuperAdmin()
  const [jobs, configuration] = await Promise.all([
    listNodeProvisioningJobs(),
    getNodeProvisioningReadiness(),
  ])
  const templateResult = await getNodeProvisioningTemplates()
    .then((templates) => ({ templates, templatesError: null }))
    .catch((error) => ({
      templates: {
        tcpTemplateHostUuid: process.env.NODE_PROVISIONING_TCP_TEMPLATE_HOST_UUID?.trim() || null,
        xhttpTemplateHostUuid: process.env.NODE_PROVISIONING_XHTTP_TEMPLATE_HOST_UUID?.trim() || null,
        hosts: [],
      },
      templatesError: error instanceof Error ? error.message : 'Не удалось загрузить hosts Remnawave',
    }))
  return NextResponse.json({
    jobs: jobs.map(serializeNodeProvisioningJob),
    templates: templateResult.templates,
    templatesError: templateResult.templatesError,
    configuration,
  })
})

export const POST = withAuth(async (request: Request) => {
  const session = await requireSuperAdmin()
  const configuration = await getNodeProvisioningReadiness()
  if (!configuration.ready) {
    return NextResponse.json(
      { error: `Provisioning не настроен: ${configuration.missing.join(', ')}` },
      { status: 503 }
    )
  }
  const limit = await rateLimit(request, `node-provisioning:${session.uid}`, 5, 15 * 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Слишком много задач. Подождите и попробуйте снова.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    )
  }

  const parsed = createNodeProvisioningSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Проверьте имя, публичный IP, SSH-доступ и шаблоны hosts', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const job = await createNodeProvisioningJob(parsed.data, session.uid)
    await writeAuditLog({
      actorId: session.uid,
      action: 'ADMIN_NODE_PROVISIONING_CREATED',
      message: 'Создана задача установки Remnawave-ноды',
      metadata: {
        entityType: 'nodeProvisioningJob',
        jobId: job.id,
        nodeName: job.nodeName,
        fqdn: job.fqdn,
        serverIp: job.serverIp,
      },
      request,
    })
    return NextResponse.json({ job: serializeNodeProvisioningJob(job) }, { status: 202 })
  } catch (error) {
    if (error instanceof NodeProvisioningConflictError) {
      return NextResponse.json({ error: error.message, jobId: error.jobId }, { status: 409 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Для этого IP или домена уже выполняется задача' }, { status: 409 })
    }
    throw error
  }
})

async function getNodeProvisioningReadiness() {
  const configuration = getNodeProvisioningConfiguration()
  const heartbeat = await getWorkerHeartbeat('node-provisioning')
  const workerReady = Boolean(heartbeat && heartbeat.resetAt > new Date())
  const missing = workerReady
    ? configuration.missing
    : [...configuration.missing, 'NODE_PROVISIONING_WORKER']
  return { ready: missing.length === 0, missing: [...new Set(missing)] }
}
