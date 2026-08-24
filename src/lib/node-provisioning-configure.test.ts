import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const script = resolve(process.cwd(), 'deploy/configure-node-provisioning.sh')
const workDirs: string[] = []

afterEach(async () => {
  await Promise.all(workDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('configure-node-provisioning.sh', () => {
  it('fills safe defaults and keeps provisioning disabled when required values are missing', async () => {
    const fixture = await createFixture('COMPOSE_PROFILES="caddy,maintenance,provisioning"\n')

    const result = run(fixture)
    const env = await readEnv(fixture.envFile)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Node provisioning is disabled')
    expect(env.COMPOSE_PROFILES).toBe('caddy,maintenance')
    expect(env.NODE_PROVISIONING_ENCRYPTION_KEY).toMatch(/^[a-f0-9]{64}$/)
    expect(env.NODE_PROVISIONING_REMNANODE_IMAGE).toBe('remnawave/node:latest')
    expect((await stat(fixture.envFile)).mode & 0o777).toBe(0o600)
  })

  it('enables provisioning after both read-only API checks pass', async () => {
    const fixture = await createFixture(completeEnv())
    const curl = await fakeCurl(fixture.dir, '200')

    const result = run(fixture, {
      PATH: `${curl.binDir}:${process.env.PATH}`,
      NODE_PROVISIONING_VALIDATE_APIS: 'true',
    })
    const env = await readEnv(fixture.envFile)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Node provisioning is configured')
    expect(env.COMPOSE_PROFILES).toBe('caddy,maintenance,provisioning')
  })

  it('is idempotent on repeated configuration', async () => {
    const fixture = await createFixture(completeEnv())

    const first = run(fixture)
    const firstEnv = await readEnv(fixture.envFile)
    const second = run(fixture)
    const secondEnv = await readEnv(fixture.envFile)

    expect(first.status).toBe(0)
    expect(second.status).toBe(0)
    expect(secondEnv.COMPOSE_PROFILES).toBe('caddy,maintenance,provisioning')
    expect(secondEnv.NODE_PROVISIONING_ENCRYPTION_KEY).toBe(firstEnv.NODE_PROVISIONING_ENCRYPTION_KEY)
  })

  it.each([
    'remnawave/node:2.8.0@sha256:03f14935751b4ab565181e2b1766ccd1a9ac349d6839acd3ee49014e543fa232',
    'remnawave/node:3.3.1',
    'docker.io/remnawave/node:3.3.1',
    'ghcr.io/remnawave/node:3.3.1',
    `ghcr.io/remnawave/node@sha256:${'b'.repeat(64)}`,
  ])('upgrades the official fixed Remnanode image %s to latest', async (image) => {
    const fixture = await createFixture(completeEnv().replace('remnawave/node:latest', image))

    const result = run(fixture)
    const env = await readEnv(fixture.envFile)

    expect(result.status).toBe(0)
    expect(env.NODE_PROVISIONING_REMNANODE_IMAGE).toBe('remnawave/node:latest')
  })

  it('upgrades the released XX country placeholder to automatic detection', async () => {
    const fixture = await createFixture(`${completeEnv()}NODE_PROVISIONING_COUNTRY_CODE="XX"\n`)

    const result = run(fixture)
    const env = await readEnv(fixture.envFile)

    expect(result.status).toBe(0)
    expect(env.NODE_PROVISIONING_COUNTRY_CODE).toBe('AUTO')
  })

  it('preserves an explicitly configured custom Remnanode image', async () => {
    const fixture = await createFixture(completeEnv().replace('remnawave/node:latest', 'registry.example.net/node:tested'))

    const result = run(fixture)
    const env = await readEnv(fixture.envFile)

    expect(result.status).toBe(0)
    expect(env.NODE_PROVISIONING_REMNANODE_IMAGE).toBe('registry.example.net/node:tested')
  })

  it('keeps the rolling Remnanode image unchanged', async () => {
    const fixture = await createFixture(completeEnv())

    const result = run(fixture)
    const env = await readEnv(fixture.envFile)

    expect(result.status).toBe(0)
    expect(env.NODE_PROVISIONING_REMNANODE_IMAGE).toBe('remnawave/node:latest')
  })

  it('disables provisioning when an API token is rejected', async () => {
    const fixture = await createFixture(completeEnv('caddy,maintenance,provisioning'))
    const curl = await fakeCurl(fixture.dir, '401')

    const result = run(fixture, {
      PATH: `${curl.binDir}:${process.env.PATH}`,
      NODE_PROVISIONING_VALIDATE_APIS: 'true',
    })
    const env = await readEnv(fixture.envFile)

    expect(result.status).toBe(0)
    expect(result.stderr).toContain('Timeweb API token check failed')
    expect(env.COMPOSE_PROFILES).toBe('caddy,maintenance')
  })

  it('moves legacy provisioning values into the main env', async () => {
    const fixture = await createFixture('COMPOSE_PROFILES="caddy,maintenance"\n')
    await writeFile(fixture.legacyEnvFile, completeEnv(), { mode: 0o600 })

    const result = run(fixture)
    const env = await readEnv(fixture.envFile)

    expect(result.status).toBe(0)
    expect(env.TIMEWEB_API_TOKEN).toBe('timeweb-token-valid')
    expect(env.NODE_PROVISIONING_BASE_DOMAIN).toBe('nodes.example.net')
    await expect(stat(fixture.legacyEnvFile)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('fails an explicit worker start when configuration is incomplete', async () => {
    const fixture = await createFixture('COMPOSE_PROFILES="caddy,maintenance"\n')

    const result = run(fixture, { NODE_PROVISIONING_START: 'true' })

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('Node provisioning is disabled')
  })

  it('removes the obsolete static panel IP setting', async () => {
    const fixture = await createFixture([
      'COMPOSE_PROFILES="caddy,maintenance"',
      'REMNAWAVE_BASE_URL="https://panel.example.net"',
      'REMNAWAVE_TOKEN="remnawave-token-valid"',
      'TIMEWEB_API_TOKEN="timeweb-token-valid"',
      'NODE_PROVISIONING_BASE_DOMAIN="nodes.example.net"',
      'NODE_PROVISIONING_PANEL_IP="8.8.8.8"',
      'LEGAL_SUPPORT_EMAIL="admin@example.net"',
      '',
    ].join('\n'))
    const result = run(fixture)
    const env = await readEnv(fixture.envFile)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Panel API IP: resolved from REMNAWAVE_BASE_URL')
    expect(env.NODE_PROVISIONING_PANEL_IP).toBeUndefined()
  })
})

function completeEnv(profiles = 'caddy,maintenance') {
  return [
    `COMPOSE_PROFILES="${profiles}"`,
    'REMNAWAVE_BASE_URL="https://panel.example.net"',
    'REMNAWAVE_TOKEN="remnawave-token-valid"',
    'TIMEWEB_API_TOKEN="timeweb-token-valid"',
    'NODE_PROVISIONING_BASE_DOMAIN="nodes.example.net"',
    `NODE_PROVISIONING_ENCRYPTION_KEY="${'a'.repeat(64)}"`,
    'NODE_PROVISIONING_ADMIN_EMAIL="admin@example.net"',
    'NODE_PROVISIONING_REMNANODE_IMAGE="remnawave/node:latest"',
    '',
  ].join('\n')
}

async function createFixture(content: string) {
  const dir = await mkdtemp(join(tmpdir(), 'cabinet-node-config-'))
  workDirs.push(dir)
  const envFile = join(dir, '.env')
  const legacyEnvFile = join(dir, '.env.provisioner')
  await writeFile(envFile, content, { mode: 0o644 })
  return { dir, envFile, legacyEnvFile }
}

async function fakeCurl(dir: string, status: string) {
  const binDir = join(dir, 'bin')
  const path = join(binDir, 'curl')
  await mkdir(binDir)
  await writeFile(path, `#!/usr/bin/env bash\nprintf '${status}'\n`)
  await chmod(path, 0o755)
  return { binDir }
}

function run(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  extraEnv: Record<string, string> = {},
) {
  return spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      LANG: 'C',
      NODE_ENV: 'test',
      ENV_FILE: fixture.envFile,
      COMPOSE_FILE: join(fixture.dir, 'missing-compose.yml'),
      LEGACY_ENV_FILE: fixture.legacyEnvFile,
      NODE_PROVISIONING_INTERACTIVE: 'false',
      NODE_PROVISIONING_VALIDATE_APIS: 'false',
      ...extraEnv,
    },
  })
}

async function readEnv(path: string) {
  return Object.fromEntries(
    (await readFile(path, 'utf8'))
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')]
      }),
  )
}
