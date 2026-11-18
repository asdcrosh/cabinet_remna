import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const intervalMs = 6 * 60 * 60 * 1000
const repositories = { geoip: 'hydraponique/roscomvpn-geoip', geosite: 'hydraponique/roscomvpn-geosite' }
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const jsonFile = async (file) => JSON.parse(await readFile(file, 'utf8'))

function varint(bytes, offset) {
  let result = 0n
  for (let shift = 0n; shift < 70n; shift += 7n) {
    if (offset >= bytes.length) throw new Error('Truncated protobuf integer')
    const byte = bytes[offset++]
    result |= BigInt(byte & 127) << shift
    if (byte < 128) return [result, offset]
  }
  throw new Error('Invalid protobuf integer')
}

function fields(bytes) {
  const result = []
  let offset = 0
  while (offset < bytes.length) {
    let key
    ;[key, offset] = varint(bytes, offset)
    const wire = Number(key & 7n)
    const field = Number(key >> 3n)
    if (field < 1) throw new Error('Invalid protobuf field')
    let value
    if (wire === 0) [value, offset] = varint(bytes, offset)
    else if ([1, 2, 5].includes(wire)) {
      let length = wire === 1 ? 8 : 4
      if (wire === 2) {
        let encoded
        ;[encoded, offset] = varint(bytes, offset)
        if (encoded > BigInt(bytes.length)) throw new Error('Invalid protobuf length')
        length = Number(encoded)
      }
      if (offset + length > bytes.length) throw new Error('Truncated protobuf field')
      value = bytes.subarray(offset, offset + length)
      offset += length
    } else throw new Error('Unsupported protobuf wire type')
    result.push({ field, wire, value })
  }
  return result
}

export function validateDatabase(bytes, required) {
  if (bytes.length < 4 || bytes.length > 50_000_000) throw new Error('Invalid database size')
  const categories = new Map()
  for (const entry of fields(bytes)) {
    if (entry.field !== 1 || entry.wire !== 2) continue
    const values = fields(entry.value)
    const codeFields = values.filter((v) => v.field === 1 && v.wire === 2)
    if (codeFields.length !== 1) throw new Error('Invalid category code')
    const code = codeFields[0].value.toString('utf8').toLowerCase()
    if (!/^[a-z0-9_!.@-]+$/.test(code) || categories.has(code)) throw new Error('Invalid or duplicate category')
    const entries = values.filter((v) => v.field === 2 && v.wire === 2)
    for (const value of entries) fields(value.value)
    categories.set(code, entries.length)
  }
  if (!categories.size) throw new Error('Empty geodata database')
  const missing = required.filter((code) => !categories.get(code.toLowerCase()))
  if (missing.length) throw new Error(`Missing required categories: ${missing.join(', ')}`)
  return { sha256: sha256(bytes), bytes: bytes.length, categories: categories.size }
}

function routingProfile(value) {
  if (!value || /routing\/off\/?$/.test(value)) return null
  if (value.trim().startsWith('{')) return JSON.parse(value)
  const encoded = value.replace(/^base64:/, '').replace(/^.*:\/\/routing\/(?:onadd|add)\//, '')
  if (/^https?:/.test(encoded)) throw new Error('Remote routing profiles require an explicit validation source')
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
}

export function requiredCategories(settings, templates, hosts, squads = []) {
  const rules = settings.responseRules.rules.filter((r) => r.enabled && r.responseType === 'XRAY_JSON')
  if (!rules.length) throw new Error('No active Xray response rules')
  const names = new Set(rules.map((r) => r.responseModifications?.subscriptionTemplate || 'Default'))
  const ids = new Set(hosts.filter((h) => !h.isDisabled).map((h) => h.xrayJsonTemplateUuid).filter(Boolean))
  for (const squad of squads) for (const item of squad.templates || []) {
    if (item.templateType === 'XRAY_JSON') ids.add(item.templateUuid)
  }
  const selected = templates.filter((t) => t.templateType === 'XRAY_JSON' && (names.has(t.name) || ids.has(t.uuid)))
  for (const name of names) if (!selected.some((t) => t.name === name)) throw new Error(`Missing active template: ${name}`)
  for (const id of ids) if (!selected.some((t) => t.uuid === id)) throw new Error('Missing host or squad Xray template')
  if (selected.some((t) => !t.templateJson)) throw new Error('Active template content is unavailable')
  const inputs = selected.map((t) => t.templateJson)
  for (const rule of rules) for (const header of rule.responseModifications?.headers || []) {
    if (['routing', 'autorouting'].includes(header.key.toLowerCase())) inputs.push(routingProfile(header.value))
  }
  const required = { geoip: new Set(), geosite: new Set() }
  for (const input of inputs) {
    const encoded = JSON.stringify(input)
    for (const match of encoded.matchAll(/\b(geoip|geosite):([a-z0-9_!.@-]+)/gi)) {
      required[match[1].toLowerCase()].add(match[2].split('@')[0].toLowerCase())
    }
    for (const match of encoded.matchAll(/\bext(?:-ip)?:(geoip|geosite)\.dat:([a-z0-9_!.@-]+)/gi)) {
      required[match[1].toLowerCase()].add(match[2].split('@')[0].toLowerCase())
    }
  }
  return Object.fromEntries(Object.entries(required).map(([kind, values]) => [kind, [...values].sort()]))
}

export async function download(url, { headers = {}, maximum = 50_000_000 } = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(90_000) })
  if (!response.ok) throw new Error(`Download returned HTTP ${response.status}`)
  const chunks = []
  let length = 0
  for await (const chunk of response.body) {
    length += chunk.length
    if (length > maximum) throw new Error('Download size limit exceeded')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function liveRequirements() {
  const headers = {
    Authorization: `Bearer ${process.env.REMNAWAVE_API_TOKEN}`,
    'X-Forwarded-Proto': 'https',
    'X-Forwarded-For': '127.0.0.1',
  }
  if (!process.env.REMNAWAVE_API_TOKEN || !process.env.REMNAWAVE_API_URL) throw new Error('Remnawave read-only API configuration is missing')
  const get = async (route) => {
    const data = await download(new URL(route, process.env.REMNAWAVE_API_URL), { headers, maximum: 20_000_000 })
    return JSON.parse(data).response
  }
  const [settings, allTemplates, hosts, squads] = await Promise.all([
    get('/api/subscription-settings/'), get('/api/subscription-templates/'), get('/api/hosts/'), get('/api/external-squads/'),
  ])
  const templates = allTemplates.templates
  // Some backend versions omit template content from the list endpoint.
  const complete = await Promise.all(templates.map(async (template) => {
    if (template.templateType !== 'XRAY_JSON' || template.templateJson) return template
    return get(`/api/subscription-templates/${encodeURIComponent(template.uuid)}`)
  }))
  return requiredCategories(settings, complete, hosts, Array.isArray(squads) ? squads : squads.externalSquads || [])
}

export async function latestSource(kind, load = download) {
  const repo = repositories[kind]
  const metadata = JSON.parse(await load(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { 'User-Agent': 'StealthNet-Geodata/1.0', Accept: 'application/vnd.github+json' }, maximum: 2_000_000,
  }))
  if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(metadata.tag_name)) throw new Error('Invalid release tag')
  const asset = metadata.assets.find((a) => a.name === `${kind}.dat`)
  const checksum = metadata.assets.find((a) => a.name === `${kind}.dat.sha256`)
  if (!asset || !checksum) throw new Error(`Release lacks ${kind} database or checksum`)
  const releaseBase = `https://github.com/${repo}/releases/download/${encodeURIComponent(metadata.tag_name)}/`
  if (!asset.browser_download_url.startsWith(releaseBase) || !checksum.browser_download_url.startsWith(releaseBase)) throw new Error('Unexpected release asset location')
  return { repo, tag: metadata.tag_name, assetId: asset.id, assetUpdatedAt: asset.updated_at, publishedAt: metadata.published_at, url: asset.browser_download_url, checksumUrl: checksum.browser_download_url }
}

async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 })
  await rename(temporary, file)
}

export async function update({ root, getRequirements = liveRequirements, getSource = latestSource, load = download, now = () => new Date() }) {
  await mkdir(path.join(root, 'releases'), { recursive: true })
  await mkdir(path.join(root, 'state'), { recursive: true })
  const stateFile = path.join(root, 'state/status.json')
  const previousState = await jsonFile(stateFile).catch(() => ({}))
  let staging
  try {
    const required = await getRequirements()
    const sources = Object.fromEntries(await Promise.all(Object.keys(repositories).map(async (kind) => [kind, await getSource(kind)])))
    const old = await jsonFile(path.join(root, 'current/manifest.json')).catch(() => null)
    const files = {}
    const descriptions = {}
    let unchanged = Boolean(old)
    for (const kind of Object.keys(repositories)) {
      const source = sources[kind]
      const cached = old?.files?.[kind]
      let reuse = cached && cached.source.tag === source.tag && cached.source.assetId === source.assetId && cached.source.assetUpdatedAt === source.assetUpdatedAt
      let bytes
      if (reuse) {
        bytes = await readFile(path.join(root, `current/${kind}.dat`)).catch(() => null)
        if (!bytes || sha256(bytes) !== cached.sha256) reuse = false
      }
      if (!reuse) {
        unchanged = false
        const [payload, checksum] = await Promise.all([load(source.url), load(source.checksumUrl, { maximum: 10_000 })])
        const expected = checksum.toString('utf8').match(/\b[a-f0-9]{64}\b/i)?.[0]?.toLowerCase()
        if (!expected || sha256(payload) !== expected) throw new Error(`Published ${kind} checksum mismatch`)
        bytes = payload
      }
      files[kind] = bytes
      descriptions[kind] = { ...validateDatabase(bytes, required[kind]), source }
    }
    if (JSON.stringify(old?.required) !== JSON.stringify(required)) unchanged = false
    let version = old?.version
    if (!unchanged) {
      version = `${now().toISOString().replace(/[-:.]/g, '')}-${sha256(Buffer.concat(Object.values(files))).slice(0, 12)}`
      staging = path.join(root, 'releases', `.staging-${randomUUID()}`)
      await mkdir(staging)
      for (const [kind, bytes] of Object.entries(files)) {
        await writeFile(path.join(staging, `${kind}.dat`), bytes, { mode: 0o644 })
        await writeFile(path.join(staging, `${kind}.dat.sha256`), `${sha256(bytes)}  ${kind}.dat\n`, { mode: 0o644 })
      }
      await atomicJson(path.join(staging, 'manifest.json'), { version, publishedAt: now().toISOString(), required, files: descriptions })
      await rename(staging, path.join(root, 'releases', version))
      staging = null
      const pointer = path.join(root, `.current-${randomUUID()}`)
      await symlink(`releases/${version}`, pointer)
      await rename(pointer, path.join(root, 'current'))
    }
    const state = { lastCheckedAt: now().toISOString(), lastSuccessAt: now().toISOString(), lastPublishedAt: unchanged ? previousState.lastPublishedAt || old.publishedAt : now().toISOString(), version, result: unchanged ? 'unchanged' : 'published', consecutiveFailures: 0, lastError: null }
    await atomicJson(stateFile, state)
    const directories = []
    for (const name of await readdir(path.join(root, 'releases'))) {
      if (name.startsWith('.')) continue
      const entry = await stat(path.join(root, 'releases', name))
      if (entry.isDirectory()) directories.push({ name, modified: entry.mtimeMs })
    }
    directories.sort((a, b) => b.modified - a.modified)
    for (const item of directories.slice(3)) if (item.name !== version) await rm(path.join(root, 'releases', item.name), { recursive: true })
    return state
  } catch (error) {
    if (staging) await rm(staging, { recursive: true, force: true })
    const state = { ...previousState, lastCheckedAt: now().toISOString(), result: 'failed', consecutiveFailures: (previousState.consecutiveFailures || 0) + 1, lastError: error.message }
    await atomicJson(stateFile, state)
    throw error
  }
}

export async function health(root, now = Date.now()) {
  const state = await jsonFile(path.join(root, 'state/status.json'))
  if (!state.lastSuccessAt || now - Date.parse(state.lastSuccessAt) > intervalMs * 2 + 60 * 60 * 1000) throw new Error('No successful geodata check within 13 hours')
  if (state.consecutiveFailures >= 2) throw new Error('Two consecutive geodata updates failed')
  const manifest = await jsonFile(path.join(root, 'current/manifest.json'))
  for (const kind of Object.keys(repositories)) {
    const bytes = await readFile(path.join(root, `current/${kind}.dat`))
    if (sha256(bytes) !== manifest.files[kind].sha256) throw new Error('Published geodata checksum mismatch')
  }
}

async function main() {
  const root = process.env.GEODATA_ROOT || '/data'
  if (process.argv.includes('--health')) return health(root)
  if (!process.argv.includes('--loop')) {
    console.log(JSON.stringify(await update({ root })))
    return
  }
  for (;;) {
    let delay = intervalMs
    try { console.log(JSON.stringify(await update({ root }))) }
    catch (error) {
      console.error(JSON.stringify({ result: 'failed', error: error.message }))
      delay = 5 * 60 * 1000
    }
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1 })
}
