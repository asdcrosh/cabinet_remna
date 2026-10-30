import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scanSshHostKey } from './node-provisioning-runner'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers() })
afterEach(() => vi.useRealTimers())

function response(code: number, output = '') {
  vi.mocked(spawn).mockImplementationOnce(() => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })
    setImmediate(() => { child.stdout.write(output); child.emit('close', code, null) })
    return child as unknown as ReturnType<typeof spawn>
  })
}

describe('SSH readiness retry', () => {
  it('waits for a new server to expose its key, without weakening known-host checks', async () => {
    response(1)
    response(0, '8.8.8.8 ssh-ed25519 ' + Buffer.from('test-host-public-key').toString('base64') + '\n')
    const promise = scanSshHostKey('8.8.8.8', 22222)
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result.fingerprint).toMatch(/^SHA256:/)
    expect(result.knownHosts).toContain('ssh-ed25519')
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(vi.mocked(spawn).mock.calls[0]![1]).toEqual(['-T', '10', '-p', '22222', '8.8.8.8'])
  })

  it('stops after three unsuccessful attempts instead of retrying forever', async () => {
    response(1); response(1); response(1)
    const rejection = expect(scanSshHostKey('8.8.8.8', 22)).rejects.toThrow('SSH host key is unavailable')
    await vi.runAllTimersAsync()
    await rejection
    expect(spawn).toHaveBeenCalledTimes(3)
  })
})
