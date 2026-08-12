import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { isPublicIpv4 } from '@/lib/node-provisioning-validation'

export type NodeAnsibleInput = {
  serverIp: string
  sshPort: number
  sshUser: string
  sshPassword: string
  fqdn: string
  nodeSecret: string
  expectedHostKeyFingerprint?: string | null
}

export type NodeAnsibleResult = {
  hostKeyFingerprint: string
  output: string
}

export async function runNodeAnsible(
  input: NodeAnsibleInput,
  onActivity?: () => Promise<void>
): Promise<NodeAnsibleResult> {
  const workDir = await mkdtemp(join(tmpdir(), 'cabinet-node-'))
  try {
    const hostKey = await scanSshHostKey(input.serverIp, input.sshPort)
    if (input.expectedHostKeyFingerprint && input.expectedHostKeyFingerprint !== hostKey.fingerprint) {
      throw new Error(`SSH host key changed: expected ${input.expectedHostKeyFingerprint}, received ${hostKey.fingerprint}`)
    }

    const knownHostsPath = join(workDir, 'known_hosts')
    const inventoryPath = join(workDir, 'inventory.json')
    const varsPath = join(workDir, 'vars.json')
    await writeSecure(knownHostsPath, hostKey.knownHosts)
    await writeSecure(inventoryPath, JSON.stringify({
      all: {
        hosts: {
          remnanode_target: {
            ansible_host: input.serverIp,
            ansible_port: input.sshPort,
            ansible_user: input.sshUser,
            ansible_password: input.sshPassword,
            ansible_become_password: input.sshPassword,
            ansible_ssh_common_args: `-o UserKnownHostsFile=${knownHostsPath} -o StrictHostKeyChecking=yes`,
          },
        },
      },
    }))
    const panelIp = requiredEnv('NODE_PROVISIONING_PANEL_IP')
    if (!isPublicIpv4(panelIp)) throw new Error('NODE_PROVISIONING_PANEL_IP must be a public IPv4 address')
    const adminEmail = requiredEnv('NODE_PROVISIONING_ADMIN_EMAIL')
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(adminEmail)) {
      throw new Error('NODE_PROVISIONING_ADMIN_EMAIL must be a valid email')
    }
    await writeSecure(varsPath, JSON.stringify({
      node_fqdn: input.fqdn,
      node_secret_key: input.nodeSecret,
      panel_ip: panelIp,
      admin_email: adminEmail,
      remnanode_image: requiredEnv('NODE_PROVISIONING_REMNANODE_IMAGE'),
      node_api_port: 2222,
    }))

    const playbook = process.env.NODE_PROVISIONING_ANSIBLE_PLAYBOOK?.trim()
      || '/app/deploy/provisioner/provision-remnanode.yml'
    const result = await captureProcess(
      'ansible-playbook',
      ['-i', inventoryPath, playbook, '--extra-vars', `@${varsPath}`],
      {
        timeoutMs: positiveInteger(process.env.NODE_PROVISIONING_ANSIBLE_TIMEOUT_SECONDS, 1800) * 1000,
        env: {
          ...process.env,
          ANSIBLE_NOCOLOR: 'true',
          ANSIBLE_HOST_KEY_CHECKING: 'true',
          ANSIBLE_DISPLAY_ARGS_TO_STDOUT: 'false',
        },
        onActivity,
      }
    )
    const output = sanitizeProvisioningOutput(result.output, [input.sshPassword, input.nodeSecret])
    if (result.code !== 0) throw new AnsibleProvisioningError(result.code, output)
    return { hostKeyFingerprint: hostKey.fingerprint, output }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

export async function scanSshHostKey(serverIp: string, sshPort: number) {
  const result = await captureProcess('ssh-keyscan', ['-T', '10', '-p', String(sshPort), serverIp], {
    timeoutMs: 15_000,
  })
  if (result.code !== 0 || !result.stdout.trim()) throw new Error('SSH host key is unavailable')
  const lines = result.stdout.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  const validLines = lines.filter((line) => line.split(/\s+/).length >= 3)
  const keyLine = validLines.find((line) => line.split(/\s+/)[1] === 'ssh-ed25519')
    ?? validLines.find((line) => line.split(/\s+/)[1]?.startsWith('ecdsa-'))
    ?? validLines[0]
  if (!keyLine) throw new Error('SSH host key response is invalid')
  const encodedKey = keyLine.split(/\s+/)[2]!
  const fingerprint = `SHA256:${createHash('sha256').update(Buffer.from(encodedKey, 'base64')).digest('base64').replace(/=+$/, '')}`
  return { fingerprint, knownHosts: `${lines.join('\n')}\n` }
}

export function sanitizeProvisioningOutput(value: string, secrets: string[] = []) {
  let sanitized = value
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(/(ansible_(?:password|become_password)|node_secret_key|secret_key)(\s*[=:]\s*)\S+/gi, '$1$2[REDACTED]')
  for (const secret of secrets) {
    if (secret) sanitized = sanitized.split(secret).join('[REDACTED]')
  }
  return sanitized.trim().slice(-16_000)
}

async function writeSecure(path: string, content: string) {
  await writeFile(path, content, { encoding: 'utf8', mode: 0o600 })
}

async function captureProcess(
  command: string,
  args: string[],
  options: {
    timeoutMs: number
    env?: NodeJS.ProcessEnv
    onActivity?: () => Promise<void>
  }
) {
  return new Promise<{ code: number; stdout: string; output: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let output = ''
    let timedOut = false
    let killTimer: ReturnType<typeof setTimeout> | undefined
    let activity = Promise.resolve()
    const append = (chunk: Buffer, isStdout: boolean) => {
      const text = chunk.toString('utf8')
      output = `${output}${text}`.slice(-64_000)
      if (isStdout) stdout = `${stdout}${text}`.slice(-64_000)
      if (options.onActivity) activity = activity.then(options.onActivity).catch(() => undefined)
    }
    child.stdout.on('data', (chunk: Buffer) => append(chunk, true))
    child.stderr.on('data', (chunk: Buffer) => append(chunk, false))
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5_000)
    }, options.timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      reject(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      activity.finally(() => {
        if (timedOut) resolve({ code: 124, stdout, output: `${output}\n${command} timed out` })
        else if (signal) reject(new Error(`${command} stopped by ${signal}`))
        else resolve({ code: code ?? 1, stdout, output })
      })
    })
  })
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function positiveInteger(raw: string | undefined, fallback: number) {
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

export class AnsibleProvisioningError extends Error {
  constructor(public exitCode: number, public output: string) {
    super(`Ansible exited with code ${exitCode}: ${output.slice(-4_000)}`)
    this.name = 'AnsibleProvisioningError'
  }
}
