import { EventEmitter } from 'node:events'
import { connect } from 'node:net'
import { connect as connectTls } from 'node:tls'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { probeHttpsThroughSocks } from './node-provisioning-probe'

vi.mock('node:net', () => ({ connect: vi.fn(), createServer: vi.fn() }))
vi.mock('node:tls', () => ({ connect: vi.fn() }))

beforeEach(() => vi.resetAllMocks())
afterEach(() => vi.useRealTimers())

function setup(mode: 'success' | 'closed' | 'silent' | 'wrong-status' = 'success') {
  let buffer = Buffer.from([5, 0, 5, 0, 0, 1, 127, 0, 0, 1, 0, 80])
  const socket = Object.assign(new EventEmitter(), {
    setTimeout: vi.fn(), destroy: vi.fn(), write: vi.fn(),
    read: vi.fn((size: number) => { const part = buffer.subarray(0, size); buffer = buffer.subarray(size); return part }),
  })
  const tls = Object.assign(new EventEmitter(), {
    destroy: vi.fn(),
    write: vi.fn(() => queueMicrotask(() => {
      if (mode === 'success') tls.emit('data', Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n'))
      if (mode === 'closed') tls.emit('close')
      if (mode === 'wrong-status') tls.emit('data', Buffer.from('HTTP/1.1 503 Unavailable\r\n\r\n'))
    })),
  })
  vi.mocked(connect).mockImplementation(() => {
    queueMicrotask(() => socket.emit('connect'))
    return socket as unknown as ReturnType<typeof connect>
  })
  vi.mocked(connectTls).mockImplementation(() => {
    queueMicrotask(() => tls.emit('secureConnect'))
    return tls as unknown as ReturnType<typeof connectTls>
  })
  return { socket, tls }
}

describe('HTTPS through the VPN SOCKS tunnel', () => {
  it('sends the destination through SOCKS and enforces real TLS certificate verification', async () => {
    const f = setup()
    await expect(probeHttpsThroughSocks(12345, 'https://www.cloudflare.com/cdn-cgi/trace', 200)).resolves.toEqual({ status: 200 })
    expect(connect).toHaveBeenCalledWith({ host: '127.0.0.1', port: 12345 })
    expect(connectTls).toHaveBeenCalledWith(expect.objectContaining({ socket: f.socket, rejectUnauthorized: true, servername: 'www.cloudflare.com' }))
    const destination = f.socket.write.mock.calls[1]![0] as Buffer
    expect(destination.subarray(5, -2).toString()).toBe('www.cloudflare.com')
    expect(f.socket.destroy).toHaveBeenCalled()
  })

  it('rejects an abruptly closed tunnel instead of leaving the job stuck', async () => {
    setup('closed')
    await expect(probeHttpsThroughSocks(12345, 'https://www.cloudflare.com', 200)).rejects.toThrow('закрыто')
  })

  it('has a deadline even when a destroyed TLS socket emits no error', async () => {
    vi.useFakeTimers()
    const f = setup('silent')
    const rejected = expect(probeHttpsThroughSocks(12345, 'https://www.cloudflare.com', 200, 100)).rejects.toThrow('не ответил вовремя')
    await vi.runAllTimersAsync()
    await rejected
    expect(f.tls.destroy).toHaveBeenCalled()
  })

  it('does not accept a failing external HTTP response as working VPN traffic', async () => {
    setup('wrong-status')
    await expect(probeHttpsThroughSocks(12345, 'https://www.cloudflare.com', 200)).rejects.toThrow('503')
  })
})
