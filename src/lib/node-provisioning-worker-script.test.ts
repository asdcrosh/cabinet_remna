import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const worker = readFileSync(resolve('scripts/node-provisioning-worker.ts'), 'utf8')

describe('node provisioning worker lifecycle', () => {
  it('takes a process-wide PostgreSQL lock before recovering interrupted jobs', () => {
    expect(worker).toContain('pg_try_advisory_lock($1::bigint)')
    expect(worker).toContain('pg_advisory_unlock($1::bigint)')
    expect(worker.indexOf('const lockClient = await acquireWorkerLock()')).toBeLessThan(
      worker.indexOf('const interruptedJobs = await failInterruptedNodeProvisioningJobs()'),
    )
  })
})
