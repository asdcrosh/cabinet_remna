import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function composeService(source: string, service: string) {
  const match = source.match(new RegExp(`^  ${service}:\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:|^volumes:)`, 'm'))
  if (!match) throw new Error(`Compose service ${service} not found`)
  return match[0]
}

function parsePullProgress(log: string, elapsedSeconds: number) {
  const updater = read('deploy/update-server.sh')
  const parser = updater.match(/python3 - "\$\{log_file\}" "\$\{elapsed\}" <<'PY'\n([\s\S]*?)\nPY/)
  if (!parser?.[1]) throw new Error('Pull progress parser not found')

  const directory = mkdtempSync(resolve(tmpdir(), 'cabinet-pull-progress-'))
  const logPath = resolve(directory, 'docker-pull.log')
  try {
    writeFileSync(logPath, log)
    return execFileSync('python3', ['-', logPath, String(elapsedSeconds)], {
      encoding: 'utf8',
      input: parser[1],
    }).trim()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function rewriteNginxUpstream(config: string, upstream: string) {
  const updater = read('deploy/update-server.sh')
  const script = updater.match(/switch_nginx_upstream\(\) \{[\s\S]*?python3 <<'PY'\n([\s\S]*?)\nPY/)
  if (!script?.[1]) throw new Error('Nginx upstream rewriter not found')

  const directory = mkdtempSync(resolve(tmpdir(), 'cabinet-nginx-switch-'))
  const configPath = resolve(directory, 'nginx.conf')
  try {
    writeFileSync(configPath, config)
    execFileSync('python3', ['-'], {
      encoding: 'utf8',
      input: script[1],
      env: {
        ...process.env,
        NGINX_CONF_PATH: configPath,
        NGINX_UPSTREAM_VALUE: upstream,
      },
    })
    return readFileSync(configPath, 'utf8')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('production deployment security', () => {
  it('calculates Docker pull ETA for classic and current progress formats', () => {
    expect(parsePullProgress('abcd1234: Downloading [======>] 5MB/10MB\r', 12)).toBe('50|12')
    expect(parsePullProgress('\u001b[2Kabcd1234 Downloading 1.5MiB / 3MiB\r', 8)).toBe('50|8')
  })

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

  it('keeps a healthy candidate online while replacing the main application', () => {
    const compose = read('deploy/docker-compose.server.yml')
    const updater = read('deploy/update-server.sh')
    const candidate = composeService(compose, 'app-candidate')
    const candidateStart = updater.indexOf('--force-recreate app-candidate')
    const candidateHealth = updater.indexOf('wait_for_healthy_container remnawave-cabinet-app-candidate')
    const trafficSwitch = updater.indexOf('switch_nginx_upstream "remnawave-cabinet-app-candidate:3000"')
    const mainStart = updater.indexOf('--force-recreate "${runtime_services[@]}"')

    expect(candidate).toContain('profiles:')
    expect(candidate).toContain('- deployment')
    expect(candidate).toContain('remnawave-cabinet-app-candidate')
    expect(candidate).toContain('healthcheck:')
    expect(candidateStart).toBeGreaterThan(0)
    expect(candidateHealth).toBeGreaterThan(candidateStart)
    expect(trafficSwitch).toBeGreaterThan(candidateHealth)
    expect(mainStart).toBeGreaterThan(trafficSwitch)
    expect(updater).toContain('up -d --remove-orphans seed')
    expect(updater).toContain('wait_for_successful_container remnawave-cabinet-seed')
    expect(updater).toContain('switch_nginx_upstream "remnawave-cabinet-app:3000"')
    expect(updater).toContain('--profile deployment rm -fsv app-candidate')
  })

  it('switches nginx after Remnawave removes managed block comments', () => {
    const unmanaged = `server {
  server_name cabinet.example.com;
  location / {
    set $cabinet_upstream remnawave-cabinet-app-candidate:3000;
    proxy_pass http://$cabinet_upstream;
  }
}\n`
    const managed = `# BEGIN REMNAWAVE CABINET
${unmanaged}# END REMNAWAVE CABINET\n`

    for (const config of [unmanaged, managed]) {
      const result = rewriteNginxUpstream(config, 'remnawave-cabinet-app:3000')
      expect(result).toContain('set $cabinet_upstream remnawave-cabinet-app:3000;')
      expect(result).not.toContain('set $cabinet_upstream remnawave-cabinet-app-candidate:3000;')
    }
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
    expect(cabinetctl).toContain('UPDATE_STATUS_CACHE_TTL="${CABINETCTL_UPDATE_CACHE_TTL:-60}"')
    expect(cabinetctl).toContain('rm -f "${UPDATE_STATUS_CACHE}"')
    expect(cabinetctl).toContain('[ НОВАЯ ВЕРСИЯ КАБИНЕТА СОБИРАЕТСЯ ]')
    expect(cabinetctl).toContain('[ НОВАЯ ВЕРСИЯ КАБИНЕТА ]')
    expect(cabinetctl).toContain('"Docker-образ"')
    expect(cabinetctl).toContain('LIVE_REFRESH_INTERVAL="${CABINETCTL_LIVE_REFRESH_INTERVAL:-60}"')
    expect(cabinetctl).toContain('GITHUB_COMMITS_ATOM_URL=')
    expect(cabinetctl).toContain('ghcr_image_exists "${branch_sha}"')
    expect(cabinetctl).toContain('manifests/sha-${sha}')
    expect(cabinetctl).toContain('render_live_refresh_timer "${remaining}"')
    expect(cabinetctl).toContain('Следующая проверка Docker-образа и cabinetctl через %s сек.')
    expect(cabinetctl).toContain("'') MENU_CHOICE=\"${MENU_SELECTED}\"")
    expect(cabinetctl).toContain("'[A'|'[D')")
    expect(cabinetctl).toContain('move_menu_selection previous')
    expect(cabinetctl).toContain('render_menu_selection_change "${previous_selection}"')
    expect(cabinetctl).not.toContain('move_menu_selection previous; redraw_interactive_menu')
    expect(cabinetctl).toContain('render_live_update_statuses')
    expect(cabinetctl).toContain('refresh_and_render_live_statuses')
    expect(cabinetctl).toContain('collect_live_status_refresh || return 0')
    expect(cabinetctl).toContain('LIVE_REFRESH_PID=$!')
    expect(cabinetctl).toContain('read_stale_update_status_cache')
    expect(cabinetctl).toContain('[[ "${LIVE_IMAGE_STATUS}" == "${previous_image}" ]] || redraw_image=1')
    expect(cabinetctl).not.toContain('start_status_animation')
    expect(cabinetctl).not.toContain('render_status_animation_frame')
    expect(cabinetctl).toContain('refresh_live_statuses')
    const readMenu = cabinetctl.slice(
      cabinetctl.indexOf('read_menu_choice()'),
      cabinetctl.indexOf('cleanup_menu_terminal()')
    )
    expect(readMenu.indexOf('show_menu')).toBeLessThan(readMenu.indexOf('refresh_live_statuses'))
    const updateStatus = cabinetctl.slice(
      cabinetctl.indexOf('update_status_line()'),
      cabinetctl.indexOf('deployment_status_line()')
    )
    expect(updateStatus).not.toContain('check_update_status')
    expect(cabinetctl).toContain('[ АКТУАЛЬНА ]')
    expect(cabinetctl).toContain('if ! run_verified_script "${CONSOLE_INSTALL_URL}"; then')
    expect(cabinetctl).toContain('Консоль не обновлена.')
    expect(cabinetctl).toContain('reload_installed_console')
    expect(cabinetctl).toContain('exec "${CABINETCTL_PATH}"')
    expect(cabinetctl).toContain('if update_cabinet; then')
    expect(cabinetctl).toContain('if update_console; then')
    expect(cabinetctl).not.toContain('update_cabinet || true; pause')
    expect(cabinetctl).not.toContain('Перезапустите cabinetctl для загрузки новой версии.')
    expect(cabinetctl).toContain('console_badge="$(console_update_badge)"')
    expect(cabinetctl).toContain('[ НОВАЯ ВЕРСИЯ КОНСОЛИ v%s ]')
    expect(cabinetctl).toContain('details="$(latest_workflow_details || true)"')
    expect(cabinetctl).toContain('RESOLVED_RELEASE_SHA="${workflow_sha}"')
    expect(cabinetctl).toContain('RESOLVED_RELEASE_SHA=""\n    resolve_release_sha || return 1')
    expect(cabinetctl).toContain('curl_with_retries -fsSL --proto')
    expect(cabinetctl).not.toContain("--data-urlencode 'status=success'")
    expect(updater).toContain('TARGET_CABINET_IMAGE="${expected_image}"')
    expect(updater).toContain('TARGET_PROVISIONER_IMAGE="${expected_provisioner_image}"')
    expect(updater).toContain('export CABINET_IMAGE CABINET_PROVISIONER_IMAGE')
    expect(updater).toContain('docker pull "${TARGET_CABINET_IMAGE}"')
    expect(updater).toContain('docker pull "${TARGET_PROVISIONER_IMAGE}"')
    expect(updater).toContain('pull_progress_snapshot "${log_file}" "${elapsed}"')
    expect(updater).toContain('Загрузка образа кабинета: %s%%, осталось ~%s')
    expect(updater).toContain('Загрузка образа кабинета: прошло %s, ETA уточняется...')
    expect(updater).toContain('Загрузка образа кабинета: завершена за %s')
    expect(updater).toContain('format_elapsed()')
    expect(updater).toContain('B|kB|KiB|MB|MiB|GB|GiB|TB|TiB')
    expect(updater).not.toContain('Загрузка образа кабинета: %s сек.')
    expect(updater).toContain('set_deploy_stage 45 "migrations"')
    expect(updater).toContain('set_deploy_stage 85 "local_health"')
    expect(updater).toContain('set_deploy_stage 97 "cleanup"')
    expect(updater).toContain('print_deploy_progress 100 "Обновление завершено"')
    expect(updater).toContain('"progress": int(os.environ.get("DEPLOY_PROGRESS_VALUE") or 0)')
    expect(updater).not.toContain('"${COMPOSE[@]}" pull --quiet')
    expect(updater).toContain('Pulled image revision ${pulled_revision} does not match requested release ${CABINET_RELEASE_SHA}.')
    expect(updater).toContain('Pulled provisioner image revision ${pulled_revision} does not match requested release ${CABINET_RELEASE_SHA}.')
    expect(updater).toContain('Running image revision ${DEPLOYED_REVISION} does not match requested release ${CABINET_RELEASE_SHA}.')
    expect(updater).toContain('Running provisioner revision ${RUNNING_PROVISIONER_REVISION} does not match requested release ${CABINET_RELEASE_SHA}.')
    expect(updater).toContain('test -f /tmp/node-provisioning-worker-heartbeat')
    expect(updater).toContain('write_update_env_value "CABINET_IMAGE" "${TARGET_CABINET_IMAGE}"')
    expect(updater).toContain('write_update_env_value "CABINET_PROVISIONER_IMAGE" "${TARGET_PROVISIONER_IMAGE}"')
    expect(updater).toContain('Removing previous immutable cabinet image...')
    expect(updater).toContain('remove_image_if_unused "${OFFICIAL_CABINET_IMAGE}:sha-${PREVIOUS_DEPLOYED_REVISION}"')
    expect(updater).toContain('remove_image_if_unused "${ROLLBACK_IMAGE}"')
    expect(updater).toContain('remove_image_if_unused "${ROLLBACK_PROVISIONER_IMAGE}"')
    expect(updater).not.toContain("--filter 'reference=remnawave-cabinet:rollback-*'")
  })
})
