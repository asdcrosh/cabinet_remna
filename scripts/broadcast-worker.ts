import { processBroadcastDeliveryBatch } from '../src/lib/broadcast-delivery'
import { prisma } from '../src/lib/prisma'

const intervalSeconds = Number(process.env.BROADCAST_WORKER_INTERVAL_SECONDS ?? 0)

async function main() {
  if (Number.isFinite(intervalSeconds) && intervalSeconds > 0) {
    while (true) {
      await processBroadcastDeliveryBatch()
      await sleep(intervalSeconds * 1000)
    }
  }

  await processBroadcastDeliveryBatch()
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    if (!(Number.isFinite(intervalSeconds) && intervalSeconds > 0)) {
      await prisma.$disconnect()
    }
  })
