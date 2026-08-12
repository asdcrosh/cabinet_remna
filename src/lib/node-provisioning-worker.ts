import { resolve4 } from 'node:dns/promises'
import { connect } from 'node:net'
import { isDeepStrictEqual } from 'node:util'
import type { NodeProvisioningJob, NodeProvisioningStep, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { nodeHostRemark, resolveNodeCountryCode } from '@/lib/node-country'
import { decryptNodeProvisioningSecret } from '@/lib/node-provisioning-crypto'
import { runNodeAnsible, sanitizeProvisioningOutput, scanSshHostKey } from '@/lib/node-provisioning-runner'
import { upsertTimewebARecord } from '@/lib/timeweb'
import { buildHostCloneRequest, remnawave, type RemnawaveHost, type RemnawaveNode } from '@/lib/remnawave'

const STALE_JOB_MS = 45 * 60_000

export async function processNodeProvisioningBatch() {
  const job = await claimNodeProvisioningJob()
  if (!job) return false
  await processNodeProvisioningJob(job.id)
  return true
}

export async function claimNodeProvisioningJob() {
  const staleBefore = new Date(Date.now() - STALE_JOB_MS)
  const candidate = await prisma.nodeProvisioningJob.findFirst({
    where: {
      OR: [
        { status: 'PENDING' },
        { status: 'RUNNING', lockedAt: { lt: staleBefore } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  })
  if (!candidate) return null

  const claimed = await prisma.nodeProvisioningJob.updateMany({
    where: {
      id: candidate.id,
      OR: [
        { status: 'PENDING' },
        { status: 'RUNNING', lockedAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: 'RUNNING',
      lockedAt: new Date(),
      startedAt: candidate.startedAt ?? new Date(),
      attempts: { increment: 1 },
      lastError: null,
    },
  })
  return claimed.count === 1
    ? prisma.nodeProvisioningJob.findUnique({ where: { id: candidate.id } })
    : null
}

export async function processNodeProvisioningJob(jobId: string) {
  let sshPassword = ''
  let nodeSecret = ''
  try {
    let job = await requiredJob(jobId)
    if (job.credentialsExpireAt <= new Date()) throw new Error('Срок хранения SSH-пароля истёк')
    sshPassword = decryptNodeProvisioningSecret(job.encryptedSshPassword)
    const countryCode = resolveNodeCountryCode(job.serverIp)
    const { templates, profileUuid, inboundUuids } = await loadTemplates(job)

    await advance(jobId, 'DNS', 'Создаю или обновляю A-запись в Timeweb')
    const dns = await upsertTimewebARecord(job.fqdn, job.serverIp)
    await updateJob(jobId, { dnsRecordId: dns.id }, 'DNS', dns.created ? 'A-запись создана' : 'A-запись уже настроена')
    await waitForDns(job.fqdn, job.serverIp)

    await advance(jobId, 'SSH_PREFLIGHT', 'Проверяю SSH и фиксирую host key')
    const hostKey = await scanSshHostKey(job.serverIp, job.sshPort)
    if (job.sshHostKeyFingerprint && job.sshHostKeyFingerprint !== hostKey.fingerprint) {
      throw new Error('SSH host key изменился после предыдущего запуска')
    }
    await updateJob(jobId, { sshHostKeyFingerprint: hostKey.fingerprint }, 'SSH_PREFLIGHT', `SSH доступен, ключ ${hostKey.fingerprint}`)

    await advance(jobId, 'REMNAWAVE_NODE', 'Создаю ноду в Remnawave')
    job = await requiredJob(jobId)
    const plugin = await ensureTorrentBlockPlugin()
    const node = await ensureRemnawaveNode(job, profileUuid, inboundUuids, countryCode, plugin.uuid)
    await updateJob(
      jobId,
      { remnawaveNodeUuid: node.uuid },
      'REMNAWAVE_NODE',
      `Нода настроена: ${node.uuid}; страна ${countryCode}; torrent_block включён`
    )
    const secretResponse = await remnawave.getNodeSecret()
    nodeSecret = secretResponse.response.secretKey || secretResponse.response.pubKey || ''
    if (!nodeSecret) throw new Error('Remnawave не вернул SECRET_KEY ноды')

    await advance(jobId, 'ANSIBLE', 'Запускаю идемпотентный Ansible playbook')
    const touchActivity = throttledJobTouch(jobId)
    const ansible = await runNodeAnsible({
      jobId,
      serverIp: job.serverIp,
      sshPort: job.sshPort,
      sshUser: job.sshUser,
      sshPassword,
      fqdn: job.fqdn,
      nodeSecret,
      expectedHostKeyFingerprint: hostKey.fingerprint,
    }, touchActivity)
    await addEvent(jobId, 'ANSIBLE', 'SUCCESS', lastUsefulAnsibleLine(ansible.output) || 'Ansible завершён без ошибок')

    await advance(jobId, 'NODE_CONNECT', 'Жду подключения созданной ноды к панели')
    await waitForNodeConnection(node.uuid)
    await addEvent(jobId, 'NODE_CONNECT', 'SUCCESS', 'Remnawave подтверждает подключение ноды')

    await advance(jobId, 'HOSTS', 'Клонирую эталонные TCP и XHTTP hosts')
    const hosts = await ensureHosts(job, node.uuid, countryCode, templates)
    await updateJob(jobId, {
      tcpHostUuid: hosts.tcp.uuid,
      xhttpHostUuid: hosts.xhttp.uuid,
    }, 'HOSTS', 'TCP и XHTTP hosts созданы в скрытом состоянии')

    await advance(jobId, 'VERIFY', 'Проверяю DNS, HTTPS, TCP и состояние ноды')
    await verifyProvisionedNode(job, node.uuid, templates.tcp.port)
    await Promise.all([
      remnawave.updateHost({ uuid: hosts.tcp.uuid, isDisabled: templates.tcp.isDisabled, isHidden: templates.tcp.isHidden }),
      remnawave.updateHost({ uuid: hosts.xhttp.uuid, isDisabled: templates.xhttp.isDisabled, isHidden: templates.xhttp.isHidden }),
    ])

    await prisma.nodeProvisioningJob.update({
      where: { id: jobId },
      data: {
        status: 'SUCCEEDED',
        step: 'DONE',
        activeKey: null,
        lockedAt: null,
        completedAt: new Date(),
        encryptedSshPassword: '',
        lastError: null,
        events: { create: { step: 'DONE', level: 'SUCCESS', message: 'Нода подключена и готова к работе' } },
      },
    })
  } catch (error) {
    const message = safeError(error, [sshPassword, nodeSecret])
    const job = await prisma.nodeProvisioningJob.findUnique({ where: { id: jobId }, select: { step: true } })
    await prisma.nodeProvisioningJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        activeKey: null,
        lockedAt: null,
        completedAt: new Date(),
        lastError: message,
        events: { create: { step: job?.step ?? 'QUEUED', level: 'ERROR', message } },
      },
    })
  }
}

async function ensureRemnawaveNode(
  job: NodeProvisioningJob,
  profileUuid: string,
  inboundUuids: string[],
  countryCode: string,
  activePluginUuid: string
) {
  const nodes = (await remnawave.getNodes()).response
  const alignNode = async (node: RemnawaveNode) => {
    if (node.countryCode === countryCode && node.activePluginUuid === activePluginUuid) return node
    return (await remnawave.updateNode({ uuid: node.uuid, countryCode, activePluginUuid })).response
  }
  if (job.remnawaveNodeUuid) {
    const existing = nodes.find((node) => node.uuid === job.remnawaveNodeUuid)
    if (existing) return alignNode(existing)
    throw new Error('Созданная ранее нода не найдена в Remnawave')
  }
  const matches = nodes.filter((node) => node.name === job.nodeName && node.address === job.serverIp)
  const createdByThisJob = matches.filter((node) => node.note === `Created by cabinet job ${job.id}`)
  if (createdByThisJob.length === 1) {
    await addEvent(job.id, 'REMNAWAVE_NODE', 'WARNING', 'Найдена существующая точная нода, продолжаю без дубля')
    return alignNode(createdByThisJob[0]!)
  }
  if (createdByThisJob.length > 1) throw new Error('В Remnawave найдено несколько нод этой задачи')
  if (matches.length > 0) throw new Error('В Remnawave уже есть нода с таким именем и IP, но она создана не этой задачей')

  return (await remnawave.createNode({
    name: job.nodeName,
    address: job.serverIp,
    port: 2222,
    countryCode,
    activePluginUuid,
    configProfile: {
      activeConfigProfileUuid: profileUuid,
      activeInbounds: inboundUuids,
    },
    note: `Created by cabinet job ${job.id}`,
  })).response
}

async function ensureTorrentBlockPlugin() {
  const pluginName = 'torrent_block'
  const plugins = (await remnawave.getNodePlugins()).response.nodePlugins
  const matches = plugins.filter((plugin) => plugin.name.trim().toLowerCase() === pluginName)
  if (matches.length > 1) throw new Error('В Remnawave найдено несколько plugins с именем torrent_block')

  const pluginSummary = matches[0] ?? (await remnawave.createNodePlugin(pluginName)).response
  let plugin = (await remnawave.getNodePlugin(pluginSummary.uuid)).response
  const pluginConfig = buildTorrentBlockPluginConfig(plugin.pluginConfig)
  if (!isDeepStrictEqual(plugin.pluginConfig, pluginConfig)) {
    plugin = (await remnawave.updateNodePlugin(plugin.uuid, pluginConfig)).response
  }
  return plugin
}

export function buildTorrentBlockPluginConfig(value: unknown) {
  const currentConfig = isRecord(value) ? value : {}
  const currentTorrentBlocker = isRecord(currentConfig.torrentBlocker) ? currentConfig.torrentBlocker : {}
  const currentIgnoreLists = isRecord(currentTorrentBlocker.ignoreLists) ? currentTorrentBlocker.ignoreLists : {}
  return {
    ...currentConfig,
    torrentBlocker: {
      ...currentTorrentBlocker,
      enabled: true,
      blockDuration: positiveNumber(currentTorrentBlocker.blockDuration, 3600),
      ignoreLists: {
        ...currentIgnoreLists,
        ip: Array.isArray(currentIgnoreLists.ip) ? currentIgnoreLists.ip : [],
        userId: Array.isArray(currentIgnoreLists.userId) ? currentIgnoreLists.userId : [],
      },
    },
  }
}

async function loadTemplates(job: NodeProvisioningJob) {
  const [hosts, nodes] = await Promise.all([
    remnawave.getHosts().then((result) => result.response),
    remnawave.getNodes().then((result) => result.response),
  ])
  const tcp = hosts.find((host) => host.uuid === job.tcpTemplateHostUuid)
  const xhttp = hosts.find((host) => host.uuid === job.xhttpTemplateHostUuid)
  if (!tcp || !xhttp) throw new Error('Один из эталонных hosts больше не существует')
  assertTemplateTransport(tcp, 'tcp', nodes)
  assertTemplateTransport(xhttp, 'xhttp', nodes)
  const profileUuid = tcp.inbound.configProfileUuid
  if (!profileUuid || profileUuid !== xhttp.inbound.configProfileUuid) {
    throw new Error('TCP и XHTTP hosts должны относиться к одному config profile')
  }
  const inboundUuids = [tcp.inbound.configProfileInboundUuid, xhttp.inbound.configProfileInboundUuid]
  if (inboundUuids.some((uuid) => !uuid)) throw new Error('У эталонного host отсутствует inbound UUID')
  return {
    templates: { tcp, xhttp },
    profileUuid,
    inboundUuids: [...new Set(inboundUuids)] as string[],
  }
}

export function assertTemplateTransport(host: RemnawaveHost, expected: 'tcp' | 'xhttp', nodes: RemnawaveNode[]) {
  const inboundUuid = host.inbound.configProfileInboundUuid
  const inbound = nodes
    .flatMap((node) => node.configProfile?.activeInbounds || [])
    .find((item) => item.uuid === inboundUuid)
  const network = String(inbound?.network ?? inbound?.rawInbound?.streamSettings?.network ?? '').toLowerCase()
  const matches = expected === 'xhttp'
    ? ['xhttp', 'splithttp'].includes(network)
    : network === 'tcp'
  if (!matches) {
    throw new Error(`Host ${host.remark} не подтверждён как ${expected.toUpperCase()} transport`)
  }
  const sniffing = inbound?.sniffing ?? inbound?.rawInbound?.sniffing
  const destinations = new Set((sniffing?.destOverride || []).map((item) => item.toLowerCase()))
  const missingDestinations = ['http', 'tls', 'quic'].filter((item) => !destinations.has(item))
  if (!sniffing?.enabled || missingDestinations.length > 0) {
    throw new Error(
      `Inbound для host ${host.remark} не готов к torrent_block: включите sniffing.enabled и destOverride http,tls,quic`
    )
  }
}

async function ensureHosts(
  job: NodeProvisioningJob,
  nodeUuid: string,
  countryCode: string,
  templates: { tcp: RemnawaveHost; xhttp: RemnawaveHost }
) {
  const existing = (await remnawave.getHosts()).response
  const ensure = async (template: RemnawaveHost, kind: 'TCP' | 'XHTTP') => {
    const remark = nodeHostRemark(countryCode, kind)
    const jobTag = `CAB_${kind}:${job.id.slice(-20).toUpperCase()}`
    const payload = buildHostCloneRequest(template, {
      remark,
      address: job.fqdn,
      sni: replaceTemplateHostname(template.sni, template.address, job.fqdn),
      host: replaceTemplateHostname(template.host, template.address, job.fqdn),
      verifyPeerCertByName: replaceTemplateHostname(template.verifyPeerCertByName, template.address, job.fqdn),
      nodes: [nodeUuid],
      tags: [...new Set([...(template.tags || []), jobTag])].slice(-10),
      isDisabled: true,
      isHidden: true,
    })
    const matches = existing.filter((host) => host.tags?.includes(jobTag) && host.nodes.includes(nodeUuid))
    if (matches.length > 1) throw new Error(`Найдено несколько клонов ${kind} host`)
    if (matches[0]) {
      const match = matches[0]
      if (match.inbound.configProfileInboundUuid !== template.inbound.configProfileInboundUuid) {
        throw new Error(`Существующий клон ${kind} host не совпадает с эталоном`)
      }
      return (await remnawave.updateHost({ uuid: match.uuid, ...payload })).response
    }
    return (await remnawave.createHost(payload)).response
  }
  return {
    tcp: await ensure(templates.tcp, 'TCP'),
    xhttp: await ensure(templates.xhttp, 'XHTTP'),
  }
}

function replaceTemplateHostname(value: string | null | undefined, templateAddress: string, nodeFqdn: string) {
  return value?.trim().toLowerCase() === templateAddress.trim().toLowerCase() ? nodeFqdn : value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function positiveNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

async function verifyProvisionedNode(job: NodeProvisioningJob, nodeUuid: string, tcpPort: number) {
  await waitForDns(job.fqdn, job.serverIp, 30_000)
  const node = (await remnawave.getNodes()).response.find((item) => item.uuid === nodeUuid)
  if (!node?.isConnected) throw new Error('Нода перестала быть connected во время финальной проверки')
  await checkTcp(job.serverIp, tcpPort)
  const response = await fetch(`https://${job.fqdn}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  })
  if (response.status < 200 || response.status >= 400) throw new Error(`SelfSteal HTTPS вернул ${response.status}`)
  const redirect = await fetch(`http://${job.fqdn}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  })
  if (![301, 302, 307, 308].includes(redirect.status)) {
    throw new Error(`SelfSteal HTTP не перенаправляет на HTTPS: ${redirect.status}`)
  }
}

async function waitForDns(fqdn: string, expectedIp: string, timeoutMs = positiveInteger(process.env.NODE_PROVISIONING_DNS_TIMEOUT_SECONDS, 300) * 1000) {
  const deadline = Date.now() + timeoutMs
  do {
    const addresses: string[] = await resolve4(fqdn).catch(() => [])
    if (addresses.includes(expectedIp)) return
    await sleep(5_000)
  } while (Date.now() < deadline)
  throw new Error(`DNS ${fqdn} ещё не указывает на ${expectedIp}`)
}

async function waitForNodeConnection(nodeUuid: string) {
  const timeoutMs = positiveInteger(process.env.NODE_PROVISIONING_CONNECT_TIMEOUT_SECONDS, 300) * 1000
  const deadline = Date.now() + timeoutMs
  do {
    const node = (await remnawave.getNodes()).response.find((item) => item.uuid === nodeUuid)
    if (node?.isConnected) return
    await sleep(5_000)
  } while (Date.now() < deadline)
  throw new Error('Remnawave не подтвердил подключение ноды за отведённое время')
}

function checkTcp(host: string, port: number) {
  return new Promise<void>((resolve, reject) => {
    const socket = connect({ host, port })
    const timer = setTimeout(() => socket.destroy(new Error(`TCP ${port} timeout`)), 10_000)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve()
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function advance(jobId: string, step: NodeProvisioningStep, message: string) {
  await updateJob(jobId, { step, lockedAt: new Date() }, step, message)
}

async function updateJob(
  jobId: string,
  data: Prisma.NodeProvisioningJobUpdateInput,
  step: NodeProvisioningStep,
  message: string
) {
  await prisma.nodeProvisioningJob.update({
    where: { id: jobId },
    data: {
      ...data,
      events: { create: { step, message } },
    },
  })
}

async function addEvent(jobId: string, step: NodeProvisioningStep, level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR', message: string) {
  await prisma.nodeProvisioningEvent.create({ data: { jobId, step, level, message } })
}

async function touchJob(jobId: string) {
  await prisma.nodeProvisioningJob.update({ where: { id: jobId }, data: { lockedAt: new Date() } })
}

function throttledJobTouch(jobId: string) {
  let lastTouchAt = 0
  return async () => {
    const now = Date.now()
    if (now - lastTouchAt < 10_000) return
    lastTouchAt = now
    await touchJob(jobId)
  }
}

async function requiredJob(id: string) {
  const job = await prisma.nodeProvisioningJob.findUnique({ where: { id } })
  if (!job) throw new Error('Задача provisioning не найдена')
  return job
}

function lastUsefulAnsibleLine(output: string) {
  return output.split('\n').map((line) => line.trim()).filter(Boolean).slice(-1)[0]?.slice(0, 500)
}

function safeError(error: unknown, secrets: string[]) {
  const raw = error instanceof Error ? error.message : String(error)
  return sanitizeProvisioningOutput(raw, secrets).slice(-8_000) || 'Неизвестная ошибка provisioning'
}

function positiveInteger(raw: string | undefined, fallback: number) {
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
