import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { onTestFinished, test } from 'vitest'
import { health, requiredCategories, update, validateDatabase } from './updater.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const field = (number, value) => Buffer.concat([Buffer.from([number * 8 + 2, value.length]), value])
const database = (...codes) => Buffer.concat(codes.map((code) => field(1, Buffer.concat([
  field(1, Buffer.from(code)), field(2, Buffer.from([8, 1])),
]))))
const fixtures = { geoip: database('PRIVATE', 'DIRECT'), geosite: database('WIN-SPY', 'WHITELIST') }
const required = { geoip: ['direct', 'private'], geosite: ['whitelist', 'win-spy'] }

function options(root) {
  return {
    root,
    getRequirements: async () => required,
    getSource: async (kind) => ({ tag: 'release1', assetId: kind, assetUpdatedAt: '2026-11-01', url: kind, checksumUrl: `${kind}.sha256` }),
    load: async (url) => url.endsWith('.sha256') ? Buffer.from(hash(fixtures[url.split('.')[0]])) : fixtures[url],
  }
}

test('required categories cover active response profiles, host templates and ext references', () => {
  const profile = { DirectIp: ['geoip:private'], BlockSites: ['geosite:win-spy@ads'] }
  const settings = { responseRules: { rules: [{ enabled: true, responseType: 'XRAY_JSON', responseModifications: {
    subscriptionTemplate: 'manual', headers: [{ key: 'routing', value: `smproxy://routing/onadd/${Buffer.from(JSON.stringify(profile)).toString('base64')}` }],
  } }] } }
  const templates = [
    { uuid: 'one', name: 'manual', templateType: 'XRAY_JSON', templateJson: { rules: ['geoip:direct', 'ext:geosite.dat:whitelist'] } },
    { uuid: 'two', name: 'auto', templateType: 'XRAY_JSON', templateJson: { rules: ['geosite:youtube'] } },
    { uuid: 'unused', name: 'unused', templateType: 'XRAY_JSON', templateJson: { rules: ['geosite:not-installed'] } },
  ]
  assert.deepEqual(requiredCategories(settings, templates, [{ isDisabled: false, xrayJsonTemplateUuid: 'two' }]), {
    geoip: ['direct', 'private'], geosite: ['whitelist', 'win-spy', 'youtube'],
  })
})

test('protobuf validation rejects missing categories, truncation and empty required entries', () => {
  assert.equal(validateDatabase(fixtures.geosite, required.geosite).categories, 2)
  assert.throws(() => validateDatabase(fixtures.geosite, ['missing']), /Missing required/)
  assert.throws(() => validateDatabase(fixtures.geosite.subarray(0, -1), required.geosite), /Truncated/)
  assert.throws(() => validateDatabase(field(1, field(1, Buffer.from('WIN-SPY'))), ['win-spy']), /Missing required/)
})

test('publishes verified files, reuses unchanged files and survives service restart', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'geodata-test-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const args = options(root)
  assert.equal((await update(args)).result, 'published')
  const pointer = await readlink(path.join(root, 'current'))
  assert.equal((await update({ ...args, load: async () => { throw new Error('unchanged data must use cache') } })).result, 'unchanged')
  assert.equal(await readlink(path.join(root, 'current')), pointer)
  await health(root)
  await health(root, Date.now() + 14 * 60 * 60 * 1000).then(() => assert.fail('stale state must fail'), () => {})
})

test('checksum mismatch and incompatible new releases preserve the published version', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'geodata-test-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const args = options(root)
  await update(args)
  const pointer = await readlink(path.join(root, 'current'))
  const before = await readFile(path.join(root, 'current/geosite.dat'))
  const newSource = async (kind) => ({ ...await args.getSource(kind), tag: 'release2' })
  await assert.rejects(update({ ...args, getSource: newSource, load: async (url) => url.endsWith('.sha256') ? Buffer.from('0'.repeat(64)) : fixtures[url] }), /checksum mismatch/)
  assert.equal(await readlink(path.join(root, 'current')), pointer)
  assert.deepEqual(await readFile(path.join(root, 'current/geosite.dat')), before)
  const missing = database('WHITELIST')
  await assert.rejects(update({ ...args, getSource: newSource, load: async (url) => {
    if (url === 'geosite') return missing
    if (url === 'geosite.sha256') return Buffer.from(hash(missing))
    return args.load(url)
  } }), /Missing required categories: win-spy/)
  assert.equal(await readlink(path.join(root, 'current')), pointer)
  await assert.rejects(health(root), /Two consecutive/)
})

test('failed upstream checks keep files available and a later check recovers', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'geodata-test-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const args = options(root)
  await update(args)
  const pointer = await readlink(path.join(root, 'current'))
  await assert.rejects(update({ ...args, getSource: async () => { throw new Error('upstream unavailable') } }), /upstream unavailable/)
  assert.equal(await readlink(path.join(root, 'current')), pointer)
  await health(root)
  assert.equal((await update(args)).consecutiveFailures, 0)
})

test('a corrupted cached database is downloaded again before publication', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'geodata-test-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const args = options(root)
  await update(args)
  await writeFile(path.join(root, 'current/geosite.dat'), 'broken')
  assert.equal((await update(args)).result, 'published')
  await health(root)
})
