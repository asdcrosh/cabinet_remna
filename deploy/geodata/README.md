# Geodata mirror

The static service serves verified RoscomVPN databases from persistent storage.
The updater checks upstream releases every six hours and derives required
categories from the live Xray templates, host overrides and routing profiles.

Both databases must pass the upstream SHA-256 and category checks before the
`current` symlink changes. A failed download or validation leaves the published
version intact. Three published versions are retained. ETags, Last-Modified and
adjacent `.sha256` files support client revalidation.
Failed checks retry after five minutes; successful checks resume the six-hour interval.

Deployment files belong under `/opt/remnawave/geodata`; the two service definitions
are merged into `/opt/remnawave/nginx/docker-compose.yml`. Keep `updater.env`
private. Its API token only needs read access to subscription settings, hosts,
external squads and subscription templates. Never put it in the public data tree.
The installer reuses the subscription-page service token already on the server;
the updater uses it only for GET requests.

To install, copy this directory to a private staging directory on the Remnawave
host, then run `python3 /path/to/geodata/install.py` as root. The installer validates
the new services and public downloads before publishing the route. A stale NGINX
configuration bind mount requires one gateway recreation; other changes use reload.
After successful installation, run `python3 /path/to/geodata/migrate-smproxy.py`
once to migrate the SMProxy response rule. It backs up settings and compares
subscription bodies and other clients before accepting the change.

The existing full-stack backup archives `/opt/remnawave`, and its restore starts
the NGINX Compose stack, including these services. Docker restart policies also
resume serving and scheduled updates after a host restart. No host cron or
systemd installation is required.

Check status:

```sh
docker inspect remnawave-geodata remnawave-geodata-updater --format '{{.Name}} {{.State.Health.Status}}'
docker exec remnawave-geodata-updater node /app/updater.mjs --health
docker logs --tail 10 remnawave-geodata-updater
```

Do not start a second updater while its loop is running. To force a check, restart
only `remnawave-geodata-updater`. This does not restart the gateway or VPN nodes.
An unsuccessful check is recorded in `data/state/status.json`; two consecutive
failures or thirteen hours without a successful check make the container unhealthy.

For rollback, stop the updater, atomically repoint `data/current` to a retained
release, and verify both public files. Restore the previous subscription response
rules separately if rolling back the domain migration.

Run focused checks with `npx vitest run deploy/geodata/updater.test.mjs`.
