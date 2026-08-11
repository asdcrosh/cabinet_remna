# Node provisioner assets

The worker runs the static `provision-remnanode.yml` through Ansible with a
job-scoped inventory and SSH `known_hosts` file. Never disable host-key checking
or persist the submitted SSH password in the runner artifact directory.

Required extra variables:

- `node_fqdn`
- `remnanode_secret_key` (legacy runner alias: `node_secret_key`)
- `panel_api_cidr` (legacy runner alias: `panel_ip`; allowed to reach port 2222)
- `remnanode_image` pinned to a version or digest (defaults to the controller's
  `NODE_PROVISIONING_REMNANODE_IMAGE` environment variable)

The active SSH port remains publicly reachable, matching the existing manual
runbook. The Remnanode API port 2222 is restricted to `panel_api_cidr`.

Set `verify_transport_ports=true` only after the Remnawave panel has delivered
the cloned TCP and XHTTP host configuration. The base play verifies Docker,
Remnanode, SelfSteal, Nginx, the Unix socket, TLS key consistency, and UFW.
