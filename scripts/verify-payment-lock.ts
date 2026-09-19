import assert from 'node:assert/strict'
import { prisma } from '../src/lib/prisma'
import { withDistributedLock } from '../src/lib/distributed-lock'

async function main() {
  const key = `payment-provisioning:verification:${process.pid}:${Date.now()}`
  let releaseFirst!: () => void
  let markFirstAcquired!: () => void
  const firstAcquired = new Promise<void>((resolve) => { markFirstAcquired = resolve })
  const release = new Promise<void>((resolve) => { releaseFirst = resolve })

  const first = withDistributedLock(key, async () => {
    markFirstAcquired()
    await release
    return 'first'
  })
  await firstAcquired

  const concurrent = await withDistributedLock(key, async () => 'unexpected')
  assert.equal(concurrent.acquired, false, 'concurrent holder acquired the same advisory lock')

  releaseFirst()
  const firstResult = await first
  assert.deepEqual(firstResult, { acquired: true, value: 'first' })

  const afterRelease = await withDistributedLock(key, async () => 'after-release')
  assert.deepEqual(afterRelease, { acquired: true, value: 'after-release' })
  process.stdout.write('Payment provisioning advisory lock verified\n')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
