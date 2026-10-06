import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

describe('bundled payment reconciler entrypoint', () => {
  it('runs the startup check when the CommonJS bundle is executed directly', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'payment-reconciler-entrypoint-'))
    const outfile = join(directory, 'payment-reconciler.cjs')
    try {
      await build({
        entryPoints: ['scripts/payment-reconciler.ts'],
        outfile,
        bundle: true,
        platform: 'node',
        target: 'node24',
        format: 'cjs',
        external: ['@prisma/client', 'pg'],
        logLevel: 'silent',
      })
      const environment: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        NODE_PATH: resolve('node_modules'),
        NODE_ENV: 'test',
        APP_LOG_LEVEL: 'info',
        OPS_STARTUP_CHECK: 'true',
      }
      const result = spawnSync(process.execPath, [outfile], {
        env: environment,
        encoding: 'utf8',
        timeout: 15_000,
      })
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toContain('payment_reconciler.startup_check_passed')
      expect(result.stdout).not.toContain('payment_reconciler.started')

      const imported = spawnSync(process.execPath, ['-e', 'require(process.argv[1])', outfile], {
        env: environment,
        encoding: 'utf8',
        timeout: 15_000,
      })
      expect(imported.status, imported.stderr).toBe(0)
      expect(imported.stdout).not.toContain('payment_reconciler.startup_check_passed')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }, 30_000)
})
