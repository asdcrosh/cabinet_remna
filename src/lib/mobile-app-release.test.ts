import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getAppRelease, isAppAbi, openAppReleaseFile } from './mobile-app-release'

const apk = Buffer.from('fake apk bytes')
const manifest = {
  version: '1.2.0',
  build: 5,
  minBuild: 3,
  notes: 'Исправления',
  files: {
    'arm64-v8a': { file: 'stealthnet-1.2.0-arm64-v8a.apk', sha256: 'a'.repeat(64), size: apk.length },
  },
}

describe('mobile-app-release', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'app-releases-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('без manifest.json или с испорченным — выпуска нет', async () => {
    expect(await getAppRelease(dir)).toBeNull()
    await writeFile(path.join(dir, 'manifest.json'), '{not json')
    expect(await getAppRelease(dir)).toBeNull()
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ ...manifest, build: 0 }))
    expect(await getAppRelease(dir)).toBeNull()
  })

  it('не принимает пути вне папки выпусков', async () => {
    const bad = { ...manifest, files: { 'arm64-v8a': { ...manifest.files['arm64-v8a'], file: '../../etc/passwd' } } }
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(bad))
    expect(await getAppRelease(dir)).toBeNull()
  })

  it('отдаёт APK, только если размер совпадает с manifest', async () => {
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest))
    expect(await getAppRelease(dir)).toMatchObject({ version: '1.2.0', build: 5, minBuild: 3 })
    expect(await openAppReleaseFile('arm64-v8a', dir)).toBeNull()
    expect(await openAppReleaseFile('armeabi-v7a', dir)).toBeNull()

    await writeFile(path.join(dir, 'stealthnet-1.2.0-arm64-v8a.apk'), apk.subarray(0, 4))
    expect(await openAppReleaseFile('arm64-v8a', dir)).toBeNull()

    await writeFile(path.join(dir, 'stealthnet-1.2.0-arm64-v8a.apk'), apk)
    const opened = await openAppReleaseFile('arm64-v8a', dir)
    expect(opened?.entry.size).toBe(apk.length)
    expect(Buffer.from(await new Response(opened!.body).arrayBuffer())).toEqual(apk)
  })

  it('принимает manifest со всеми архитектурами, как его пишет build-release.sh', async () => {
    const files = Object.fromEntries(
      (['arm64-v8a', 'armeabi-v7a', 'x86_64'] as const).map((abi) => [
        abi,
        { file: `stealthnet-1.2.0-${abi}.apk`, sha256: 'b'.repeat(64), size: 10 },
      ])
    )
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ ...manifest, files }))
    const release = await getAppRelease(dir)
    expect(Object.keys(release?.files ?? {})).toEqual(['arm64-v8a', 'armeabi-v7a', 'x86_64'])
  })

  it('isAppAbi', () => {
    expect(isAppAbi('arm64-v8a')).toBe(true)
    expect(isAppAbi('mips')).toBe(false)
    expect(isAppAbi(null)).toBe(false)
  })
})
