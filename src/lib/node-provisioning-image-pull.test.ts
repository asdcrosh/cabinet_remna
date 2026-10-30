import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = resolve('deploy/provisioner/ansible/files/pull-remnanode.sh')

function runPull(image: string, scenario: string) {
  const dir = mkdtempSync(join(tmpdir(), 'node-pull-test-'))
  try {
    const calls = join(dir, 'calls')
    writeFileSync(calls, '')
    writeFileSync(join(dir, 'timeout'), '#!/bin/bash\nshift 3\nexec "$@"\n', { mode: 0o755 })
    writeFileSync(join(dir, 'sleep'), '#!/bin/bash\nexit 0\n', { mode: 0o755 })
    writeFileSync(join(dir, 'docker'), `#!/bin/bash
echo "$*" >> "$PULL_CALLS"
if [[ "$1" == 'image' ]]; then
  [[ "$PULL_SCENARIO" != 'tag-fails' ]]
  exit $?
fi
case "$PULL_SCENARIO" in
  succeeds) exit 0 ;;
  transient) [[ "$(wc -l < "$PULL_CALLS" | tr -d ' ')" -gt 1 ]] ;;
  fallback|tag-fails) [[ "$4" == ghcr.io/remnawave/node:* ]] ;;
  *) echo 'registry unavailable' >&2; exit 1 ;;
esac
`, { mode: 0o755 })
    const result = spawnSync('/bin/bash', [script, image], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, PULL_CALLS: calls, PULL_SCENARIO: scenario },
    })
    return { ...result, calls: readFileSync(calls, 'utf8').trim().split('\n') }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('Remnanode image download recovery', () => {
  it('is valid Bash and refreshes the requested image even when it may be cached', () => {
    execFileSync('/bin/bash', ['-n', script])
    const result = runPull('remnawave/node:latest', 'succeeds')
    expect(result.status).toBe(0)
    expect(result.calls).toEqual(['pull --quiet -- remnawave/node:latest'])
  })

  it('recovers a temporary registry failure without switching images', () => {
    const result = runPull('remnawave/node:latest', 'transient')
    expect(result.status).toBe(0)
    expect(result.calls).toHaveLength(2)
    expect(result.calls.every(call => call === 'pull --quiet -- remnawave/node:latest')).toBe(true)
  })

  it('uses the same vendor and version in GHCR after Docker Hub retries are exhausted', () => {
    const result = runPull('docker.io/remnawave/node:3.4.1', 'fallback')
    expect(result.status).toBe(0)
    expect(result.calls.slice(0, 3)).toEqual(Array(3).fill('pull --quiet -- docker.io/remnawave/node:3.4.1'))
    expect(result.calls.slice(3)).toEqual([
      'pull --quiet -- ghcr.io/remnawave/node:3.4.1',
      'image tag ghcr.io/remnawave/node:3.4.1 docker.io/remnawave/node:3.4.1',
    ])
  })

  it.each([
    'private.example/node:release',
    `remnawave/node@sha256:${'a'.repeat(64)}`,
    `remnawave/node:3.4.1@sha256:${'b'.repeat(64)}`,
  ])('preserves an explicit private image or digest: %s', image => {
    const result = runPull(image, 'fails')
    expect(result.status).toBe(1)
    expect(result.calls).toEqual(Array(3).fill(`pull --quiet -- ${image}`))
    expect(result.stderr).toContain('registry unavailable')
  })

  it('fails with registry diagnostics when both official registries are unavailable', () => {
    const result = runPull('remnawave/node:latest', 'fails')
    expect(result.status).toBe(1)
    expect(result.calls).toHaveLength(6)
    expect(result.stderr).toContain('official alternate registry')
    expect(result.stderr).toContain('Unable to download')
    expect(result.calls.some(call => call.startsWith('image tag'))).toBe(false)
  })

  it('does not report success if tagging the recovered image fails', () => {
    expect(runPull('remnawave/node:latest', 'tag-fails').status).not.toBe(0)
  })
})
