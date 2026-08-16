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
  provisioning or repair run
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
