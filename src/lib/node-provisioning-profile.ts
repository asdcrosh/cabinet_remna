import { createHash } from 'node:crypto'
import {
  remnawave,
  RemnawaveError,
  type RemnawaveConfigProfile,
  type RemnawaveConfigProfileInbound,
  type RemnawaveHost,
  type RemnawaveInternalSquad,
} from './remnawave'

export type ProvisioningTemplates = { tcp: RemnawaveHost; xhttp: RemnawaveHost }
export type PreparedProvisioningProfile = {
  profileUuid: string
  inboundUuids: string[]
  templates: ProvisioningTemplates
  inbounds: { tcp: RemnawaveConfigProfileInbound; xhttp: RemnawaveConfigProfileInbound }
  probeSquadUuids: string[]
}

export function provisioningResourceName(jobId: string, prefix = 'cab_') {
  return prefix + createHash('sha256').update(jobId).digest('hex').slice(0, 24)
}

export function provisioningNetwork(value: unknown) {
  const network = String(value ?? '').toLowerCase()
  if (network === 'raw') return 'tcp'
  if (network === 'splithttp') return 'xhttp'
  return network
}

function selectInbound(profile: RemnawaveConfigProfile, host: RemnawaveHost) {
  const inbound = profile.inbounds.find(i => i.uuid === host.inbound.configProfileInboundUuid)
  if (!inbound?.tag || !inbound.rawInbound) throw new Error(`У эталона ${host.remark} отсутствует полный inbound`)
  return inbound
}

function assertSupportedInbound(inbound: RemnawaveConfigProfileInbound, host: RemnawaveHost, kind: 'tcp' | 'xhttp') {
  const raw = inbound.rawInbound
  const stream = raw?.streamSettings
  if (raw?.protocol !== 'vless' || stream?.security !== 'reality'
    || provisioningNetwork(stream.network) !== kind) {
    throw new Error(`Автоустановка ${kind.toUpperCase()} поддерживает VLESS Reality; проверьте эталон ${host.remark}`)
  }
  if (inbound.port !== host.port || !Number.isInteger(host.port) || host.port < 1 || host.port > 65535
    || [22, 80, 2222].includes(host.port) || (kind === 'xhttp' && host.port !== 443)) {
    throw new Error(`Порт ${kind.toUpperCase()} host не соответствует inbound или конфликтует с системным портом`)
  }
  if (host.securityLayer && host.securityLayer !== 'DEFAULT') {
    throw new Error(`У эталона ${host.remark} переопределена защита; для автоустановки нужен DEFAULT`)
  }
  const reality = stream.realitySettings
  if (!reality?.privateKey || !reality.shortIds?.length || !reality.serverNames?.some(Boolean)) {
    throw new Error(`В ${kind.toUpperCase()} inbound не хватает параметров Reality`)
  }
}

export function buildNodeProvisioningProfile(source: RemnawaveConfigProfile, templates: ProvisioningTemplates, fqdn: string, resourceId = fqdn) {
  const config = structuredClone(source.config)
  const selected = { tcp: selectInbound(source, templates.tcp), xhttp: selectInbound(source, templates.xhttp) }
  const sni = { tcp: '', xhttp: '' }
  const tagBase = provisioningResourceName(resourceId, 'CAB_').slice(0, 24)
  const tags = { tcp: `${tagBase}_TCP`, xhttp: `${tagBase}_XHTTP` }
  const inbounds = (['tcp', 'xhttp'] as const).map(kind => {
    const original = selected[kind]
    assertSupportedInbound(original, templates[kind], kind)
    const raw = structuredClone(original.rawInbound!)
    raw.tag = tags[kind]
    const stream = raw.streamSettings!
    const reality = stream.realitySettings!
    const target = reality.target ?? reality.dest ?? ''
    if (!target) throw new Error(`У ${kind.toUpperCase()} inbound не задан Reality target`)
    // The local SelfSteal certificate belongs to this node. An external target
    // keeps its own allowed names; substituting the node's FQDN breaks Reality.
    const localTarget = target.startsWith('/') || target.startsWith('@') || target.startsWith('unix:')
      || /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i.test(target)
    if (localTarget) reality.serverNames = [fqdn]
    const names = reality.serverNames!.filter(name => name && !name.includes('*'))
    const proposed = localTarget ? fqdn : templates[kind].sni?.trim()
    sni[kind] = proposed && names.includes(proposed) ? proposed : names[0] || ''
    if (!sni[kind]) throw new Error(`У ${kind.toUpperCase()} inbound нет допустимого SNI`)
    if (raw.settings) raw.settings.clients = []
    return raw
  })
  if (selected.tcp.tag === selected.xhttp.tag || selected.tcp.port === selected.xhttp.port) {
    throw new Error('TCP и XHTTP должны использовать разные inbound tags и порты')
  }
  config.inbounds = inbounds
  const replacements = new Map([['tcp', selected.tcp.tag], ['xhttp', selected.xhttp.tag]].map(([kind, tag]) => [tag, tags[kind as 'tcp' | 'xhttp']]))
  const rewriteRules = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(rewriteRules)
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
      if (key === 'inboundTag' && Array.isArray(item)) {
        (value as Record<string, unknown>)[key] = item.map(tag => typeof tag === 'string' ? replacements.get(tag) ?? tag : tag)
      } else rewriteRules(item)
    }
  }
  rewriteRules(config.routing)
  return { config, selected, sni, tags }
}

async function prepareProfile(
  job: { id: string; fqdn: string; remnawaveNodeUuid: string | null },
  templates: ProvisioningTemplates,
): Promise<PreparedProvisioningProfile> {
  const sourceUuid = templates.tcp.inbound.configProfileUuid
  if (!sourceUuid || templates.xhttp.inbound.configProfileUuid !== sourceUuid) {
    throw new Error('TCP и XHTTP должны использовать один исходный config profile')
  }
  const source = (await remnawave.getConfigProfile(sourceUuid)).response
  const prepared = buildNodeProvisioningProfile(source, templates, job.fqdn, job.id)
  const squadResponse = await remnawave.getInternalSquads() as { response: { internalSquads: RemnawaveInternalSquad[] } }
  const squads = squadResponse.response?.internalSquads
  if (!Array.isArray(squads)) throw new Error('Remnawave не вернул список internal squads')
  for (const kind of ['tcp', 'xhttp'] as const) {
    if (!squads.some(s => s.inbounds.some(i => i.uuid === prepared.selected[kind].uuid))) {
      throw new Error(`Эталон ${kind.toUpperCase()} не доступен ни одному internal squad`)
    }
  }

  const name = provisioningResourceName(job.id)
  const matches = (await remnawave.getConfigProfiles()).response.configProfiles.filter(p => p.name === name)
  if (matches.length > 1) throw new Error('Найдено несколько config profiles этой задачи')
  const profile = matches[0]
    ? (await remnawave.getConfigProfile(matches[0].uuid)).response
    : (await remnawave.createConfigProfile({ name, config: prepared.config })).response
  if (profile.nodes?.some(node => node.uuid !== job.remnawaveNodeUuid)) {
    throw new Error('Профиль этой задачи используется посторонней нодой; автоматическое изменение остановлено')
  }
  const mapped = {} as PreparedProvisioningProfile['inbounds']
  const mappedTemplates = {} as ProvisioningTemplates
  for (const kind of ['tcp', 'xhttp'] as const) {
    const candidates = profile.inbounds.filter(i => i.tag === prepared.tags[kind])
    if (candidates.length !== 1) throw new Error(`В профиле задачи не найден однозначный ${kind.toUpperCase()} inbound`)
    const inbound = candidates[0]!
    assertSupportedInbound(inbound, templates[kind], kind)
    const names = inbound.rawInbound!.streamSettings!.realitySettings!.serverNames!
    const sni = names.includes(prepared.sni[kind]) ? prepared.sni[kind] : names.find(Boolean)
    if (!sni) throw new Error(`У ${kind.toUpperCase()} inbound профиля задачи нет допустимого SNI`)
    mapped[kind] = inbound
    mappedTemplates[kind] = {
      ...templates[kind], sni, overrideSniFromAddress: false, keepSniBlank: false,
      inbound: { configProfileUuid: profile.uuid, configProfileInboundUuid: inbound.uuid },
    }
  }

  const probeSquads = new Set<string>()
  const granted = new Set<string>()
  for (const summary of squads) {
    const kinds = (['tcp', 'xhttp'] as const).filter(kind => summary.inbounds.some(i => i.uuid === prepared.selected[kind].uuid))
    if (!kinds.length) continue
    // Refresh immediately before merging so unrelated squad entries survive.
    const squad = (await remnawave.getInternalSquad(summary.uuid)).response
    const additions = kinds.filter(kind => squad.inbounds.some(i => i.uuid === prepared.selected[kind].uuid))
    const uuids = new Set(squad.inbounds.map(i => i.uuid))
    for (const kind of additions) uuids.add(mapped[kind].uuid)
    if (uuids.size !== squad.inbounds.length) {
      await remnawave.updateInternalSquad({ uuid: squad.uuid, inbounds: [...uuids] })
    }
    if (additions.length) probeSquads.add(squad.uuid)
    additions.forEach(kind => granted.add(kind))
  }
  if (!granted.has('tcp') || !granted.has('xhttp')) throw new Error('Доступ squads к эталонам изменился во время установки; повторите задачу')
  return {
    profileUuid: profile.uuid, inboundUuids: [mapped.tcp.uuid, mapped.xhttp.uuid],
    templates: mappedTemplates, inbounds: mapped, probeSquadUuids: [...probeSquads],
  }
}

export async function prepareNodeProvisioningProfile(
  job: { id: string; fqdn: string; remnawaveNodeUuid: string | null },
  templates: ProvisioningTemplates,
) {
  try { return await prepareProfile(job, templates) } catch (error) {
    // Profile bodies contain private keys. Do not include API response bodies
    // in job errors even if a vendor validation endpoint echoes its input.
    if (error instanceof RemnawaveError) throw new Error(`Remnawave не подготовил профиль/squads (HTTP ${error.status})`)
    throw error
  }
}
