import { remnawave } from '../src/lib/remnawave'
import type { RemnawaveConfigProfileInbound, RemnawaveInternalSquad } from '../src/lib/remnawave'
import { provisioningNetwork, type PreparedProvisioningProfile } from '../src/lib/node-provisioning-profile'
import { verifyNodeProvisioningTraffic } from '../src/lib/node-provisioning-traffic'
import { isPublicIpv4 } from '../src/lib/node-provisioning-validation'
import { resolve4 } from 'node:dns/promises'

async function main() {
  const name = process.argv[2]
  if (!name) throw new Error('Usage: verify-node-provisioning-traffic <node name>')
  const [nodes, hosts] = await Promise.all([remnawave.getNodes(), remnawave.getHosts()])
  const matches = nodes.response.filter(node => node.name === name)
  if (matches.length !== 1 || !matches[0]!.isConnected) throw new Error('Нужна одна подключённая нода с этим именем')
  const node = matches[0]!
  const addresses = isPublicIpv4(node.address) ? [node.address] : await resolve4(node.address)
  if (addresses.length !== 1 || !isPublicIpv4(addresses[0]!)) throw new Error('Нужен один публичный IPv4 ноды')
  const selected = (kind: string) => {
    const inbound = node.configProfile?.activeInbounds?.find(i => provisioningNetwork(i.network) === kind)
    if (!inbound?.uuid || !inbound.rawInbound) throw new Error(`Нет ${kind} inbound`)
    const matches = hosts.response.filter(host => host.nodes.includes(node.uuid) && host.inbound.configProfileInboundUuid === inbound.uuid && !host.isDisabled)
    if (matches.length !== 1) throw new Error(`Не найден однозначный ${kind} host`)
    return { host: matches[0]!, inbound: inbound as RemnawaveConfigProfileInbound }
  }
  const tcp = selected('tcp')
  const xhttp = selected('xhttp')
  const squads = await remnawave.getInternalSquads() as { response: { internalSquads: RemnawaveInternalSquad[] } }
  const profile: PreparedProvisioningProfile = {
    profileUuid: node.configProfile!.activeConfigProfileUuid!,
    inboundUuids: [tcp.inbound.uuid, xhttp.inbound.uuid],
    inbounds: { tcp: tcp.inbound, xhttp: xhttp.inbound },
    templates: { tcp: tcp.host, xhttp: xhttp.host },
    probeSquadUuids: squads.response.internalSquads.filter(squad => squad.inbounds.some(i => [tcp.inbound.uuid, xhttp.inbound.uuid].includes(i.uuid))).map(squad => squad.uuid),
  }
  await verifyNodeProvisioningTraffic({ id: `canary-${node.uuid}`, serverIp: addresses[0]! }, profile.templates, profile,
    async message => { console.log(message) })
  console.log('TCP и XHTTP проверены; временный пользователь удалён')
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Проверка не завершена'); process.exitCode = 1 })
