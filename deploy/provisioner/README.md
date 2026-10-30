# Node provisioner assets

The cabinet and this worker share the single server `.env`. Configure it with
`cabinetctl provisioning`; do not create a separate `.env.provisioner`.
Compose passes a strict allowlist from that file to the provisioner and masks
the Timeweb token from all other long-lived services.

The worker runs the static `provision-remnanode.yml` through Ansible with a
job-scoped inventory and SSH `known_hosts` file. Never disable host-key checking
or persist the submitted SSH password in the runner artifact directory.

Required extra variables:

- `node_fqdn`
- `remnanode_secret_key` (legacy runner alias: `node_secret_key`)
- `panel_api_cidrs` (legacy aliases: `panel_api_cidr`, `panel_ip`; allowed to reach port 2222)
- `remnanode_image` defaults to `remnawave/node:latest` and is pulled on every
  provisioning or repair run, with three bounded download attempts. Tagged
  official images can fall back between Docker Hub and the vendor's GHCR
  repository at the same tag; private images and digest pins never switch.
  Container startup uses the downloaded image without another registry request.
  Download, configuration and startup failures report their cause with the node
  secret removed. During `cabinetctl update`, fixed tags and digests
  of the official Docker Hub or GHCR Remnawave Node image are migrated to this
  rolling default. An image from a private registry remains an explicit override
- node country is detected locally from the bundled MaxMind GeoLite2 country
  database; `NODE_PROVISIONING_COUNTRY_CODE` can override it with an ISO code
- the shared `torrent_block` plugin is created/configured through Remnawave API
  and attached to every provisioned node

The active SSH port remains publicly reachable, matching the existing manual
runbook. The Remnanode API port 2222 is restricted to `panel_api_cidrs`. Cabinet
resolves these addresses from `REMNAWAVE_BASE_URL` immediately before every
deployment and removes outdated rules for this port.

SelfSteal is installed through its official non-interactive `--force --domain`
mode, pinned to a reviewed commit and checksum. The worker also installs the
pinned acme.sh release with the administrator email before certificate issuance.
Certificate issuance uses direct TLS-ALPN on port 443 first, while Remnanode is
stopped and always started again by an Ansible `always` block. HTTP-01 on port 80
is a non-fatal fallback and records listener/container diagnostics when it is not
available. Retries leave a healthy installation untouched and resume an owned,
internally consistent bootstrap instead of reinstalling it. Only an unsafe or
incomplete project owned by the same job (or an inactive legacy partial with the
exact FQDN) is moved to
`/opt/nginx-selfsteal.partial-<job>-<timestamp>` before recovery.

GeoIP data is provided by [MaxMind GeoLite2](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data)
through the `geoip-country` package. Its license and EULA are copied into the
provisioner image under `/app/licenses/geoip-country`.

Set `verify_transport_ports=true` only after the Remnawave panel has delivered
the cloned TCP and XHTTP host configuration. The base play verifies Docker,
Remnanode, SelfSteal, Nginx, the Unix socket, TLS key consistency, and UFW.

Each job gets its own config profile and unique inbound tags. Local SelfSteal
inbounds use the new node's FQDN for SNI; external Reality targets retain an
allowed camouflage name. Routing references and the source inbounds' internal
squad access are mapped to the new inbounds. The shared source profile stays
unchanged, and retries reuse the job's profile.

Hosts remain disabled and hidden until both TCP and XHTTP carry an HTTPS
request through an isolated Xray client. The client has one VLESS outbound and
no direct fallback. Its binary is copied from the pinned official Node image.
The probe user expires after 15 minutes, has a 50 MB limit, and is deleted with
confirmation before acceptance. Failed or interrupted checks clean up probe
access; an unconfirmed cleanup prevents publication. SSH passwords are removed
only after successful acceptance, so failed jobs remain retryable during their
credential TTL.

To repeat the traffic checks for an existing node without reinstalling it:

```bash
docker exec remnawave-cabinet-node-provisioning-worker node ops/verify-node-provisioning-traffic.js ro01
```

Supported templates are VLESS Reality TCP and XHTTP with matching host/inbound
ports and DEFAULT security. XHTTP uses port 443. Both source inbounds must have
internal squad access. Unsupported templates fail validation before SSH or DNS
changes. Concurrent create/retry requests lock both the target IP and FQDN.
