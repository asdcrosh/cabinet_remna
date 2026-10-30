import { spawn } from 'node:child_process'
import { createServer, connect, type Socket } from 'node:net'
import { connect as connectTls } from 'node:tls'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPrivateKey, createPublicKey } from 'node:crypto'
import type { RemnawaveConfigProfileInbound, RemnawaveHost } from './remnawave'
import { provisioningNetwork } from './node-provisioning-profile'
import { sanitizeProvisioningOutput } from './node-provisioning-runner'

export type TrafficProbeConfig = {
  log: { loglevel: string }
  inbounds: Array<{ listen: string; port: number; protocol: string; settings: Record<string, unknown> }>
  outbounds: Array<Record<string, unknown>>
}

export function buildNodeTrafficProbeConfig(host: RemnawaveHost, inbound: RemnawaveConfigProfileInbound, userId: string, serverIp: string): TrafficProbeConfig {
  const stream = inbound.rawInbound?.streamSettings
  const reality = stream?.realitySettings
  const sni = host.overrideSniFromAddress ? host.address : host.sni
  if (!sni || host.keepSniBlank || !reality?.serverNames?.includes(sni)) {
    throw new Error(`SNI ${host.remark} не входит в serverNames его Reality inbound`)
  }
  if (!reality.privateKey || !reality.shortIds?.length || !userId) throw new Error('Не хватает параметров тестового Reality-соединения')
  const key = createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), Buffer.from(reality.privateKey, 'base64url')]),
    format: 'der', type: 'pkcs8',
  })
  const password = createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url')
  const network = provisioningNetwork(stream?.network)
  if (!['tcp', 'xhttp'].includes(network)) throw new Error('Тест трафика поддерживает TCP и XHTTP')
  const serverXhttp = stream?.xhttpSettings ?? {}
  let extra = host.xhttpExtraParams
  if (typeof extra === 'string' && extra) extra = JSON.parse(extra)
  const xhttp = {
    ...serverXhttp,
    ...(isRecord(extra) ? extra : {}),
    path: host.path || serverXhttp.path,
    ...(host.host ? { host: host.host } : {}),
  }
  return {
    log: { loglevel: 'warning' },
    inbounds: [{ listen: '127.0.0.1', port: 0, protocol: 'socks', settings: { auth: 'noauth', udp: false } }],
    outbounds: [{
      protocol: 'vless',
      settings: { vnext: [{ address: serverIp, port: host.port, users: [{ id: userId, encryption: 'none', flow: network === 'tcp' ? 'xtls-rprx-vision' : '' }] }] },
      streamSettings: {
        network, security: 'reality',
        realitySettings: { serverName: sni, fingerprint: host.fingerprint || 'chrome', password, shortId: reality.shortIds[0], spiderX: '/' },
        ...(network === 'xhttp' ? { xhttpSettings: xhttp } : {}),
      },
    }],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

async function freeLocalPort() {
  const server = createServer()
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(error => {
        if (error || !address || typeof address === 'string') reject(error || new Error('Не удалось выбрать локальный порт проверки'))
        else resolve(address.port)
      })
    })
  })
}

function readBytes(socket: Socket, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    const cleanup = () => {
      socket.off('readable', readable)
      socket.off('error', failed)
      socket.off('close', closed)
    }
    const failed = (error: Error) => { cleanup(); reject(error) }
    const closed = () => failed(new Error('SOCKS-соединение закрыто до завершения handshake'))
    const readable = () => {
      const value = socket.read(length) as Buffer | null
      if (value) { cleanup(); resolve(value) }
    }
    socket.on('readable', readable)
    socket.once('error', failed)
    socket.once('close', closed)
    readable()
  })
}

export async function probeHttpsThroughSocks(port: number, endpoint: string, expectedStatus: number, timeoutMs = 10_000) {
  const url = new URL(endpoint)
  if (url.protocol !== 'https:') throw new Error('Трафик проверяется только через HTTPS')
  const socket = connect({ host: '127.0.0.1', port })
  socket.setTimeout(timeoutMs, () => socket.destroy(new Error('Истекло время проверки трафика')))
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })
    socket.write(Buffer.from([5, 1, 0]))
    const greeting = await readBytes(socket, 2)
    if (greeting[0] !== 5 || greeting[1] !== 0) throw new Error('Тестовый Xray отклонил SOCKS handshake')
    const name = Buffer.from(url.hostname, 'ascii')
    const destinationPort = Number(url.port || 443)
    socket.write(Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([destinationPort >> 8, destinationPort & 255])]))
    const response = await readBytes(socket, 4)
    if (response[0] !== 5 || response[1] !== 0) throw new Error(`VPN отклонил соединение (SOCKS ${response[1]})`)
    const addressBytes = response[3] === 1 ? 4 : response[3] === 4 ? 16 : response[3] === 3 ? (await readBytes(socket, 1))[0]! : -1
    if (addressBytes < 0) throw new Error('Некорректный ответ SOCKS')
    await readBytes(socket, addressBytes + 2)
    const tls = connectTls({ socket, servername: url.hostname, rejectUnauthorized: true, ALPNProtocols: ['http/1.1'] })
    return await new Promise<{ status: number }>((resolve, reject) => {
      let data = ''
      let settled = false
      const timer = setTimeout(() => finish(new Error('HTTPS через VPN не ответил вовремя')), timeoutMs)
      const finish = (error?: Error, status?: number) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.setTimeout(0)
        tls.destroy()
        if (error) reject(error)
        else resolve({ status: status! })
      }
      tls.once('error', finish)
      tls.once('close', () => finish(new Error('HTTPS-соединение закрыто до ответа')))
      tls.once('secureConnect', () => tls.write(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nConnection: close\r\nUser-Agent: Cabinet-Node-Probe\r\n\r\n`))
      tls.on('data', chunk => {
        data += chunk.toString('utf8')
        if (data.length > 32_768) return finish(new Error('Слишком большой ответ проверки трафика'))
        if (!data.includes('\r\n\r\n')) return
        const status = Number(data.match(/^HTTP\/1\.[01] (\d{3})/)?.[1])
        if (status !== expectedStatus) return finish(new Error(`HTTPS через VPN вернул ${status || 'неверный ответ'}`))
        finish(undefined, status)
      })
      tls.once('end', () => { if (!data.includes('\r\n\r\n')) finish(new Error('VPN не вернул полный HTTPS-ответ')) })
    })
  } finally {
    socket.destroy()
  }
}

export async function runNodeTrafficProbe(config: TrafficProbeConfig, secrets: string[], onActivity?: () => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'cabinet-traffic-'))
  let port: number
  try { port = await freeLocalPort() } catch (error) { await rm(dir, { recursive: true, force: true }); throw error }
  const path = join(dir, 'client.json')
  const client = structuredClone(config)
  client.inbounds[0]!.port = port
  try { await writeFile(path, JSON.stringify(client), { mode: 0o600 }) } catch (error) { await rm(dir, { recursive: true, force: true }); throw error }
  const sensitive: string[] = [...secrets]
  const collect = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(collect)
    else if (isRecord(value)) for (const [key, item] of Object.entries(value)) {
      if (['id', 'password', 'publicKey'].includes(key) && typeof item === 'string') sensitive.push(item)
      else collect(item)
    }
  }
  collect(client.outbounds)
  const child = spawn('/usr/local/bin/xray', ['run', '-c', path], { stdio: ['ignore', 'pipe', 'pipe'], shell: false })
  let output = ''
  let spawnError: Error | undefined
  child.on('error', error => { spawnError = error })
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()))
  const append = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-4000) }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  const endpoints = [
    ['https://www.cloudflare.com/cdn-cgi/trace', 200],
    ['https://www.gstatic.com/generate_204', 204],
  ] as const
  let lastError: unknown
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise(resolve => setTimeout(resolve, attempt ? 2000 : 300))
      await onActivity?.()
      if (spawnError || child.exitCode !== null) throw spawnError || new Error('Тестовый Xray завершился до проверки')
      for (const [endpoint, status] of endpoints) {
        try { return await probeHttpsThroughSocks(port, endpoint, status) } catch (error) { lastError = error }
      }
    }
    throw lastError || new Error('Трафик через VPN не подтверждён')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(sanitizeProvisioningOutput(`${message}\n${output}`, sensitive))
  } finally {
    child.kill('SIGTERM')
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000)
    await closed
    clearTimeout(timer)
    await rm(dir, { recursive: true, force: true })
  }
}
