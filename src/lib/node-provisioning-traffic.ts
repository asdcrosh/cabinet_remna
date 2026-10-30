import { remnawave, RemnawaveError, type RemnawaveHost } from './remnawave'
import { provisioningResourceName, type PreparedProvisioningProfile } from './node-provisioning-profile'
import { buildNodeTrafficProbeConfig, runNodeTrafficProbe } from './node-provisioning-probe'

export async function cleanupNodeProvisioningProbe(jobId: string) {
  const username = provisioningResourceName(jobId, 'cab_probe_')
  let existing
  try { existing = (await remnawave.getUser({ username })).response } catch (error) {
    if (error instanceof RemnawaveError && error.status === 404) return
    throw new Error('Не удалось проверить временную учётную запись проверки VPN')
  }
  if (existing.description !== `Cabinet provisioning probe ${jobId}`) throw new Error('Имя тестовой учётной записи занято посторонним пользователем')
  await remnawave.deleteUser({ username })
  try { await remnawave.getUser({ username }) } catch (error) {
    if (error instanceof RemnawaveError && error.status === 404) return
    throw new Error('Не удалось подтвердить удаление тестового VPN-пользователя')
  }
  throw new Error('Тестовый VPN-пользователь остался в Remnawave после удаления')
}

export async function verifyNodeProvisioningTraffic(
  job: { id: string; serverIp: string },
  hosts: { tcp: RemnawaveHost; xhttp: RemnawaveHost },
  profile: PreparedProvisioningProfile,
  onResult: (message: string) => Promise<void>,
  onActivity?: () => Promise<void>,
) {
  const username = provisioningResourceName(job.id, 'cab_probe_')
  const description = `Cabinet provisioning probe ${job.id}`
  const removeProbe = () => cleanupNodeProvisioningProbe(job.id)
  // A worker or network failure can leave a short-lived probe from the previous
  // attempt. Resolve it by its stable name; users can have numeric IDs or UUIDs.
  await removeProbe()
  let failure: unknown
  try {
    const user = (await remnawave.createUser({
      username, description, status: 'ACTIVE',
      expireAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      trafficLimitBytes: 50_000_000, trafficLimitStrategy: 'NO_RESET',
      activeInternalSquads: profile.probeSquadUuids,
    })).response
    if (!user.vlessUuid) throw new Error('Remnawave не вернул данные тестового VLESS-пользователя')
    for (const kind of ['tcp', 'xhttp'] as const) {
      const config = buildNodeTrafficProbeConfig(hosts[kind], profile.inbounds[kind], user.vlessUuid, job.serverIp)
      try {
        const result = await runNodeTrafficProbe(config, [user.vlessUuid, user.trojanPassword, user.ssPassword].filter(Boolean), onActivity)
        await onResult(`${kind.toUpperCase()}: HTTPS ${result.status}, реальный трафик через VPN подтверждён`)
      } catch (error) {
        throw new Error(`${kind.toUpperCase()}: ${error instanceof Error ? error.message : 'VPN-трафик не подтверждён'}`)
      }
    }
  } catch (error) {
    failure = error instanceof RemnawaveError ? new Error(`API проверки VPN вернул HTTP ${error.status}`) : error
  } finally {
    try { await removeProbe() } catch {
      const cause = failure instanceof Error ? `${failure.message}; ` : ''
      throw new Error(`${cause}Не удалось удалить временного VPN-пользователя; нода не опубликована. Повторите проверку для завершения очистки.`)
    }
  }
  if (failure) throw failure
}
