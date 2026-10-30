import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNodeProvisioningJob, retryNodeProvisioningJob } from './node-provisioning'

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }))
vi.mock('./prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('./node-provisioning-crypto', () => ({ encryptNodeProvisioningSecret: () => 'encrypted' }))

const oldDomain = process.env.NODE_PROVISIONING_BASE_DOMAIN
beforeEach(() => {
  vi.resetAllMocks()
  process.env.NODE_PROVISIONING_BASE_DOMAIN = 'example.test'
  mocks.query.mockResolvedValue([{ locked: 1 }])
  mocks.findFirst.mockResolvedValue(null)
  mocks.transaction.mockImplementation(callback => callback({
    $queryRaw: mocks.query,
    nodeProvisioningJob: { findFirst: mocks.findFirst, findUnique: mocks.findUnique, create: mocks.create, update: mocks.update },
  }))
})
afterEach(() => {
  if (oldDomain === undefined) delete process.env.NODE_PROVISIONING_BASE_DOMAIN
  else process.env.NODE_PROVISIONING_BASE_DOMAIN = oldDomain
})

describe('provisioning target locks', () => {
  it('locks both the IP and FQDN before testing or creating a job', async () => {
    await createNodeProvisioningJob({ nodeName: 'ro01', serverIp: '8.8.8.8', sshPort: 22, sshUser: 'root', sshPassword: 'private-pass', tcpTemplateHostUuid: 'tcp', xhttpTemplateHostUuid: 'xhttp' }, 'actor')
    expect(mocks.query.mock.calls.map(call => call[1])).toEqual(['cabinet-node:fqdn:ro01.example.test', 'cabinet-node:ip:8.8.8.8'])
    expect(mocks.query.mock.invocationCallOrder[1]!).toBeLessThan(mocks.findFirst.mock.invocationCallOrder[0]!)
    expect(mocks.findFirst.mock.invocationCallOrder[0]!).toBeLessThan(mocks.create.mock.invocationCallOrder[0]!)
  })

  it('rechecks job status after waiting for a competing retry request', async () => {
    const job = { id: 'job', fqdn: 'ro01.example.test', serverIp: '8.8.8.8', status: 'FAILED', encryptedSshPassword: 'encrypted', credentialsExpireAt: new Date(Date.now() + 60000) }
    mocks.findUnique.mockResolvedValueOnce(job).mockResolvedValueOnce({ ...job, status: 'PENDING' })
    await expect(retryNodeProvisioningJob('job')).rejects.toThrow('Повторить можно только задачу с ошибкой')
    expect(mocks.findUnique).toHaveBeenCalledTimes(2)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
