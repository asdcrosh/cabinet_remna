import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function composeService(source: string, service: string) {
  const match = source.match(new RegExp(`^  ${service}:\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:|^volumes:)`, 'm'))
  if (!match) throw new Error(`Compose service ${service} not found`)
  return match[0]
}

describe('production deployment security', () => {
  it('does not inject the application env file into database or Caddy', () => {
    const compose = read('deploy/docker-compose.server.yml')
    const database = composeService(compose, 'db')
    const caddy = composeService(compose, 'caddy')

    expect(database).not.toContain('env_file:')
    expect(database).toContain('POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}')
    expect(caddy).not.toContain('env_file:')
    expect(caddy).not.toContain('JWT_SECRET')
    expect(caddy).not.toContain('REMNAWAVE_TOKEN')
  })

  it('pins every GitHub Action to a full commit SHA', () => {
    for (const workflow of ['.github/workflows/quality.yml', '.github/workflows/docker-image.yml']) {
      const actions = [...read(workflow).matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1])
      expect(actions.length).toBeGreaterThan(0)
      expect(actions.every((item) => /@[0-9a-f]{40}$/.test(item || ''))).toBe(true)
    }
  })

  it('runs security checks before the Docker registry login and publish steps', () => {
    const workflow = read('.github/workflows/docker-image.yml')
    const audit = workflow.indexOf('npm audit --audit-level=high')
    const tests = workflow.indexOf('npm run test')
    const login = workflow.indexOf('docker/login-action@')
    const publish = workflow.indexOf('docker/build-push-action@')

    expect(audit).toBeGreaterThan(0)
    expect(tests).toBeGreaterThan(audit)
    expect(login).toBeGreaterThan(tests)
    expect(publish).toBeGreaterThan(login)
  })

  it('publishes immutable image tags with the full release commit', () => {
    const workflow = read('.github/workflows/docker-image.yml')

    expect(workflow.match(/type=sha,prefix=sha-,format=long/g)).toHaveLength(2)
  })

  it('does not pipe remote downloads directly into a shell', () => {
    const files = [
      'deploy/cabinetctl.sh',
      'deploy/install-console.sh',
      'deploy/install-server.sh',
      'deploy/update-server.sh',
      'deploy/setup-nginx-proxy.sh',
    ]

    for (const file of files) {
      expect(read(file)).not.toMatch(/(?:curl|wget)[^\n]*\|[^\n]*(?:ba)?sh/)
    }
  })

  it('pins and verifies third-party bootstrap scripts', () => {
    const cabinetctl = read('deploy/cabinetctl.sh')
    const installer = read('deploy/install-server.sh')
    const nginxSetup = read('deploy/setup-nginx-proxy.sh')

    for (const source of [cabinetctl, installer]) {
      expect(source).toContain('DOCKER_INSTALL_COMMIT="a23123f03978989e95d257beb9de0c5ad9da6e70"')
      expect(source).toContain('DOCKER_INSTALL_SHA256="754dc3837b3da3eb65c8a355a713569cf7f0328addd3edc783897c3b9a54e192"')
    }
    expect(nginxSetup).toContain('ACME_SH_VERSION="3.1.4"')
    expect(nginxSetup).toContain('ACME_SH_SHA256="fcabf274d4f96966ec933879ae0257266e8ef2f7d16161f14b84dd896c0cac32"')
  })

  it('verifies cabinet release files against an immutable commit tree', () => {
    for (const file of ['deploy/cabinetctl.sh', 'deploy/install-console.sh']) {
      const source = read(file)
      expect(source).toContain('OFFICIAL_CONTENTS_API=')
      expect(source).toContain('git_blob_sha')
      expect(source).toContain('expected_blob_sha')
    }
  })

  it('keeps the console installer minimal and defers restore dependencies', () => {
    const installer = read('deploy/install-console.sh')
    const cabinetctl = read('deploy/cabinetctl.sh')
    const backupMenu = cabinetctl.match(/backup_menu\(\) \{([\s\S]*?)\n\}/)?.[1] || ''

    expect(installer).toContain('install_remote_script "${CABINETCTL_URL}" "${CABINETCTL_PATH}"')
    expect(installer).not.toContain('BACKUP_SCRIPT_URL=')
    expect(installer).not.toContain('BACKUP_SCRIPT_PATH=')
    expect(installer).not.toContain('install_remote_script "${BACKUP_SCRIPT_URL}"')
    expect(installer).not.toContain('install-server.sh')
    expect(backupMenu).toContain('ensure_docker')
    expect(backupMenu).toContain('ensure_backup_command')
  })

  it('deploys verified cabinet releases by immutable sha image tag', () => {
    const cabinetctl = read('deploy/cabinetctl.sh')
    const updater = read('deploy/update-server.sh')

    expect(cabinetctl).toContain('CABINET_IMAGE="ghcr.io/asdcrosh/cabinet_remna:sha-${verified_release_sha}"')
    expect(cabinetctl).toContain('info "Целевая версия: ${verified_release_sha:0:12}"')
    expect(cabinetctl).not.toContain('if [[ -n "${CABINET_IMAGE:-}" ]]')
    expect(cabinetctl).toContain("printf '%s|%s|%s\\n' \"$(date +%s)\" \"${VERSION}\" \"${status}\"")
    expect(cabinetctl).toContain('[[ "${cache_version}" == "${VERSION}" ]] || return 1')
    expect(cabinetctl).toContain('console_badge="$(console_update_badge)"')
    expect(cabinetctl).toContain('[ ДОСТУПНА v%s ]')
    expect(cabinetctl).toContain('details="$(latest_workflow_details || true)"')
    expect(cabinetctl).toContain('RESOLVED_RELEASE_SHA="${workflow_sha}"')
    expect(cabinetctl).not.toContain("--data-urlencode 'status=success'")
    expect(updater).toContain('CABINET_IMAGE_REFERENCE="${CABINET_IMAGE:-$(read_update_env_value CABINET_IMAGE)}"')
    expect(updater).toContain('write_update_env_value "CABINET_IMAGE" "${CABINET_IMAGE}"')
  })
})
