import type { NodeProvisioningEvent, NodeProvisioningJob, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { remnawave } from '@/lib/remnawave'
import type { RemnawaveConfigProfileInbound, RemnawaveHost } from '@/lib/remnawave'
import { encryptNodeProvisioningSecret } from '@/lib/node-provisioning-crypto'
import { buildProvisioningFqdn } from '@/lib/node-provisioning-validation'

export const NODE_PROVISIONING_STEPS = [
  ['QUEUED', 'В очереди'],
  ['DNS', 'DNS в Timeweb'],
  ['SSH_PREFLIGHT', 'Проверка SSH'],
  ['REMNAWAVE_NODE', 'Нода в Remnawave'],
  ['ANSIBLE', 'Установка Ansible'],
  ['NODE_CONNECT', 'Подключение ноды'],
  ['HOSTS', 'Клонирование TCP и XHTTP'],
  ['VERIFY', 'Финальная проверка'],
  ['DONE', 'Готово'],
] as const

export type CreateNodeProvisioningInput = {
  nodeName: string
  serverIp: string
  sshPort: number
  sshUser: string
  sshPassword: string
  tcpTemplateHostUuid: string
  xhttpTemplateHostUuid: string
}

export function getNodeProvisioningConfiguration() {
  const required = ['NODE_PROVISIONING_BASE_DOMAIN', 'NODE_PROVISIONING_ENCRYPTION_KEY'] as const
  const missing = required.filter((name) => !process.env[name]?.trim())
  if ((process.env.NODE_PROVISIONING_ENCRYPTION_KEY?.trim().length ?? 0) > 0
    && (process.env.NODE_PROVISIONING_ENCRYPTION_KEY?.trim().length ?? 0) < 32) {
    missing.push('NODE_PROVISIONING_ENCRYPTION_KEY')
  }
  return { ready: missing.length === 0, missing: [...new Set(missing)] }
}

const eventSelect = {
  id: true,
  step: true,
  level: true,
  message: true,
  createdAt: true,
} satisfies Prisma.NodeProvisioningEventSelect

const jobInclude = {
  events: {
    orderBy: { createdAt: 'asc' },
    select: eventSelect,
  },
} satisfies Prisma.NodeProvisioningJobInclude

export type NodeProvisioningJobWithEvents = Prisma.NodeProvisioningJobGetPayload<{ include: typeof jobInclude }>

let templatesCache: { expiresAt: number; value: Awaited<ReturnType<typeof loadNodeProvisioningTemplates>> } | null = null

export async function listNodeProvisioningJobs(take = 20) {
  return prisma.nodeProvisioningJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(50, Math.max(1, take)),
    include: jobInclude,
  })
}

export async function getNodeProvisioningJob(id: string) {
  return prisma.nodeProvisioningJob.findUnique({ where: { id }, include: jobInclude })
}

export async function createNodeProvisioningJob(input: CreateNodeProvisioningInput, createdById: string) {
  const fqdn = buildProvisioningFqdn(input.nodeName)
  const credentialsTtlHours = positiveInteger(process.env.NODE_PROVISIONING_CREDENTIALS_TTL_HOURS, 24)
  const credentialsExpireAt = new Date(Date.now() + credentialsTtlHours * 60 * 60 * 1000)

  return prisma.$transaction(async (tx) => {
    const conflicting = await tx.nodeProvisioningJob.findFirst({
      where: {
        status: { in: ['PENDING', 'RUNNING'] },
        OR: [{ fqdn }, { serverIp: input.serverIp }],
      },
      select: { id: true },
    })
    if (conflicting) throw new NodeProvisioningConflictError(conflicting.id)

    return tx.nodeProvisioningJob.create({
      data: {
        activeKey: fqdn,
        nodeName: input.nodeName,
        fqdn,
        serverIp: input.serverIp,
        sshPort: input.sshPort,
        sshUser: input.sshUser,
        encryptedSshPassword: encryptNodeProvisioningSecret(input.sshPassword),
        credentialsExpireAt,
        tcpTemplateHostUuid: input.tcpTemplateHostUuid,
        xhttpTemplateHostUuid: input.xhttpTemplateHostUuid,
        createdById,
        events: {
          create: { step: 'QUEUED', message: 'Задача поставлена в очередь' },
        },
      },
      include: jobInclude,
    })
  })
}

export async function retryNodeProvisioningJob(id: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.nodeProvisioningJob.findUnique({ where: { id } })
    if (!job) throw new NodeProvisioningNotFoundError()
    if (job.status !== 'FAILED') throw new NodeProvisioningStateError('Повторить можно только задачу с ошибкой')
    if (job.credentialsExpireAt <= new Date() || !job.encryptedSshPassword) {
      throw new NodeProvisioningStateError('SSH-пароль уже удалён или истёк. Создайте новую задачу.')
    }

    const conflicting = await tx.nodeProvisioningJob.findFirst({
      where: {
        id: { not: id },
        status: { in: ['PENDING', 'RUNNING'] },
        OR: [{ fqdn: job.fqdn }, { serverIp: job.serverIp }],
      },
      select: { id: true },
    })
    if (conflicting) throw new NodeProvisioningConflictError(conflicting.id)

    return tx.nodeProvisioningJob.update({
      where: { id },
      data: {
        status: 'PENDING',
        activeKey: job.fqdn,
        lockedAt: null,
        completedAt: null,
        lastError: null,
        events: { create: { step: job.step, message: 'Задача возвращена в очередь' } },
      },
      include: jobInclude,
    })
  })
}

export async function getNodeProvisioningTemplates() {
  if (templatesCache && templatesCache.expiresAt > Date.now()) return templatesCache.value
  const value = await loadNodeProvisioningTemplates()
  templatesCache = { value, expiresAt: Date.now() + 60_000 }
  return value
}

async function loadNodeProvisioningTemplates() {
  const [{ response }, inboundsResult] = await Promise.all([
    remnawave.getHosts(),
    remnawave.getConfigProfileInbounds(),
  ])
  const inbounds = new Map(
    inboundsResult.response.inbounds.map((inbound) => [inbound.uuid, inbound])
  )
  return {
    tcpTemplateHostUuid: process.env.NODE_PROVISIONING_TCP_TEMPLATE_HOST_UUID?.trim() || null,
    xhttpTemplateHostUuid: process.env.NODE_PROVISIONING_XHTTP_TEMPLATE_HOST_UUID?.trim() || null,
    hosts: response.map((host) => ({
      uuid: host.uuid,
      remark: host.remark,
      address: host.address,
      port: host.port,
      kind: inferHostKind(
        host,
        host.inbound.configProfileInboundUuid
          ? inbounds.get(host.inbound.configProfileInboundUuid)
          : undefined
      ),
      isDisabled: host.isDisabled,
      isHidden: host.isHidden ?? false,
      configProfileUuid: host.inbound.configProfileUuid ?? null,
    })),
  }
}

export function serializeNodeProvisioningJob(job: NodeProvisioningJobWithEvents) {
  const currentIndex = NODE_PROVISIONING_STEPS.findIndex(([key]) => key === job.step)
  return {
    id: job.id,
    nodeName: job.nodeName,
    serverIp: job.serverIp,
    sshPort: job.sshPort,
    sshUser: job.sshUser,
    status: job.status,
    currentStep: job.step,
    domain: job.fqdn,
    lastError: job.lastError,
    attempts: job.attempts,
    remnawaveNodeUuid: job.remnawaveNodeUuid,
    tcpHostUuid: job.tcpHostUuid,
    xhttpHostUuid: job.xhttpHostUuid,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    steps: NODE_PROVISIONING_STEPS.map(([key, label], index) => ({
      key,
      label,
      status: stepStatus(job, index, currentIndex),
      events: job.events
        .filter((event) => event.step === key)
        .map(serializeNodeProvisioningEvent),
    })),
  }
}

function stepStatus(job: NodeProvisioningJob, index: number, currentIndex: number) {
  if (job.status === 'SUCCEEDED' || index < currentIndex) return 'SUCCEEDED'
  if (index > currentIndex) return 'PENDING'
  if (job.status === 'FAILED') return 'FAILED'
  if (job.status === 'RUNNING') return 'RUNNING'
  return 'PENDING'
}

function serializeNodeProvisioningEvent(event: Pick<NodeProvisioningEvent, 'id' | 'level' | 'message' | 'createdAt'>) {
  return {
    id: event.id,
    level: event.level,
    message: event.message,
    createdAt: event.createdAt.toISOString(),
  }
}

export function inferHostKind(
  host: Pick<RemnawaveHost, 'remark' | 'path' | 'port' | 'xhttpExtraParams'>,
  inbound?: Pick<RemnawaveConfigProfileInbound, 'network' | 'rawInbound'>
) {
  const network = String(
    inbound?.network ?? inbound?.rawInbound?.streamSettings?.network ?? ''
  ).toLowerCase()
  if (network === 'xhttp' || network === 'splithttp') return 'XHTTP'
  if (network === 'tcp') return 'TCP'

  if (host.xhttpExtraParams != null) return 'XHTTP'
  const text = `${host.remark} ${host.path || ''}`.toLowerCase()
  if (text.includes('xhttp') || text.includes('split')) return 'XHTTP'
  if (text.includes('tcp') || host.port === 10443) return 'TCP'
  return 'OTHER'
}

function positiveInteger(raw: string | undefined, fallback: number) {
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

export class NodeProvisioningConflictError extends Error {
  constructor(public jobId: string) {
    super('Для этого IP или домена уже выполняется задача')
    this.name = 'NodeProvisioningConflictError'
  }
}

export class NodeProvisioningNotFoundError extends Error {
  constructor() {
    super('Задача не найдена')
    this.name = 'NodeProvisioningNotFoundError'
  }
}

export class NodeProvisioningStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NodeProvisioningStateError'
  }
}
