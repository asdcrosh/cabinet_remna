#!/usr/bin/env python3
"""Install geodata services; rebind a stale gateway config only when necessary."""
import datetime
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import socket
import ssl
import subprocess
import time

BASE = Path('/opt/remnawave/geodata')
COMPOSE = Path('/opt/remnawave/nginx/docker-compose.yml')
NGINX = Path('/opt/remnawave/nginx/nginx.conf')
SERVICES = ['remnawave-geodata', 'remnawave-geodata-updater']

def run(args, timeout=120):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stderr[-1200:])
    return result.stdout

def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]

def compose_config():
    return json.loads(run(['docker', 'compose', '-f', str(COMPOSE), 'config', '--format', 'json']))

def public_get(name, etag=None):
    class LocalHTTPS(http.client.HTTPSConnection):
        def connect(self):
            self.sock = self._context.wrap_socket(socket.create_connection(('127.0.0.1', 443), self.timeout), server_hostname=self.host)
    connection = LocalHTTPS('sub.stealthnet.site', context=ssl.create_default_context(), timeout=20)
    headers = {'If-None-Match': etag} if etag else {}
    connection.request('GET', '/geodata/roscomvpn/' + name, headers=headers)
    response = connection.getresponse()
    body = response.read()
    metadata = {'status': response.status, 'bytes': len(body), 'etag': response.getheader('ETag'), 'last_modified': response.getheader('Last-Modified')}
    connection.close()
    return body, metadata

def main():
    os.umask(0o077)
    source = Path(__file__).resolve().parent
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = Path('/opt/remnawave-backups/releases') / ('geodata-' + timestamp)
    backup.mkdir(parents=True)
    old_compose = COMPOSE.read_text()
    old_nginx = NGINX.read_text()
    before_config = compose_config()
    old_gateway = inspect('remnawave-nginx')['Id']
    (backup / 'docker-compose.before.yml').write_text(old_compose)
    (backup / 'nginx.before.conf').write_text(old_nginx)
    BASE.mkdir(exist_ok=True, mode=0o755)
    BASE.chmod(0o755)
    for filename in ['updater.mjs', 'nginx-main.conf', 'nginx-static.conf', 'compose-services.yml', 'README.md', 'install.py']:
        if (source / filename).resolve() != (BASE / filename).resolve():
            shutil.copyfile(source / filename, BASE / filename)
        (BASE / filename).chmod(0o644)
    data = BASE / 'data'
    data.mkdir(exist_ok=True, mode=0o755)
    os.chown(data, 1000, 1000)
    data.chmod(0o755)
    environment = dict(v.split('=', 1) for v in inspect('remnawave-subscription-page')['Config']['Env'] if '=' in v)
    # Keep the existing internal service credential on the server, outside the
    # public volume. No credentials are included in the deployment source.
    env_values = {'REMNAWAVE_API_URL': environment['REMNAWAVE_PANEL_URL'], 'REMNAWAVE_API_TOKEN': environment['REMNAWAVE_API_TOKEN']}
    (BASE / 'updater.env').write_text(''.join(k + '=' + json.dumps(v) + '\n' for k, v in env_values.items()))
    (BASE / 'updater.env').chmod(0o600)
    fragment = (source / 'compose-services.yml').read_text().split('services:\n', 1)[1]
    if not all(name in before_config['services'] for name in SERVICES):
        assert not any(name in before_config['services'] for name in SERVICES), 'Partial previous service installation'
        match = re.search(r'^services:\n( +)\S', old_compose, re.M)
        assert match and len(match.group(1)) >= 2
        indent = ' ' * (len(match.group(1)) - 2)
        block = '\n'.join(indent + line if line else '' for line in fragment.splitlines()) + '\n\n'
        network_start = re.search(r'^networks:\s*$', old_compose, re.M)
        assert network_start, 'No top-level network configuration'
        COMPOSE.write_text(old_compose[:network_start.start()] + block + old_compose[network_start.start():])
    route = '''    # BEGIN STEALTHNET GEODATA MIRROR
    location ^~ /geodata/roscomvpn/ {
        resolver 127.0.0.11 valid=30s ipv6=off;
        resolver_timeout 2s;
        set $stealthnet_geodata_upstream remnawave-geodata:8080;
        proxy_pass http://$stealthnet_geodata_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }
    # END STEALTHNET GEODATA MIRROR

'''
    changed_gateway = False
    recreated_gateway = False
    try:
        after_config = compose_config()
        for name, config in before_config['services'].items():
            assert after_config['services'][name] == config, 'Existing Compose service changed'
        run(['docker', 'compose', '-f', str(COMPOSE), 'up', '-d', '--no-deps', *SERVICES], timeout=180)
        for _ in range(180):
            state_path = data / 'state/status.json'
            if state_path.exists():
                state = json.loads(state_path.read_text())
                if state.get('result') == 'failed':
                    raise RuntimeError('Initial geodata check failed: ' + state.get('lastError', 'unknown error'))
                if state.get('lastSuccessAt') and (data / 'current/manifest.json').exists():
                    break
            time.sleep(2)
        else:
            raise RuntimeError('Initial geodata publication did not finish')
        run(['docker', 'exec', 'remnawave-geodata-updater', 'node', '/app/updater.mjs', '--health'])
        run(['docker', 'exec', 'remnawave-nginx', 'curl', '--fail', '--silent', '--output', '/dev/null', 'http://remnawave-geodata:8080/geodata/roscomvpn/manifest.json'])
        if '# BEGIN STEALTHNET GEODATA MIRROR' not in old_nginx:
            server = old_nginx.index('server_name sub.stealthnet.site;')
            location = old_nginx.index('    location / {', server)
            # Write in place: NGINX has this file bind-mounted by inode.
            NGINX.write_text(old_nginx[:location] + route + old_nginx[location:])
            changed_gateway = True
        else:
            start = old_nginx.rfind('\n', 0, old_nginx.index('# BEGIN STEALTHNET GEODATA MIRROR')) + 1
            end = old_nginx.index('\n', old_nginx.index('# END STEALTHNET GEODATA MIRROR')) + 1
            NGINX.write_text(old_nginx[:start] + route + old_nginx[end:].lstrip('\n'))
            changed_gateway = True
        (backup / 'nginx.candidate.conf').write_text(NGINX.read_text())
        bound = run(['docker', 'exec', 'remnawave-nginx', 'cat', '/etc/nginx/conf.d/default.conf'])
        if bound != NGINX.read_text():
            # A previous atomic replacement can leave Docker bound to a deleted
            # inode. Validate the candidate in an isolated container first.
            run(['docker', 'compose', '-f', str(COMPOSE), 'run', '--rm', '-T', '--no-deps', '--entrypoint', 'nginx', 'remnawave-nginx', '-t'])
            run(['docker', 'compose', '-f', str(COMPOSE), 'up', '-d', '--no-deps', '--force-recreate', 'remnawave-nginx'])
            recreated_gateway = True
        else:
            expanded = run(['docker', 'exec', 'remnawave-nginx', 'nginx', '-T'])
            assert route.strip() in expanded, 'Gateway does not load the candidate route'
            run(['docker', 'exec', 'remnawave-nginx', 'nginx', '-t'])
            run(['docker', 'exec', 'remnawave-nginx', 'nginx', '-s', 'reload'])
        checks = {}
        for name in ['geoip.dat', 'geosite.dat']:
            expected = (data / 'current' / name).read_bytes()
            # The gateway reload is asynchronous; an old worker may accept the
            # first connection before the new location becomes active.
            for attempt in range(20):
                try:
                    body, metadata = public_get(name)
                except OSError as error:
                    metadata = {'connection_error': type(error).__name__}
                    time.sleep(0.25)
                    continue
                if metadata['status'] == 200 and body == expected:
                    break
                time.sleep(0.25)
            else:
                raise RuntimeError('Public geodata content mismatch: ' + json.dumps(metadata))
            _, conditional = public_get(name, metadata['etag'])
            assert metadata['etag'] and conditional['status'] == 304, 'ETag revalidation failed'
            checks[name] = {**metadata, 'sha256': hashlib.sha256(body).hexdigest(), 'conditional_status': conditional['status']}
        if not recreated_gateway:
            assert inspect('remnawave-nginx')['Id'] == old_gateway, 'The existing HTTPS gateway was unexpectedly recreated'
        result = {'installed': True, 'gateway_recreated': recreated_gateway, 'backup': str(backup), 'public_checks': checks, 'updater': json.loads((data / 'state/status.json').read_text())}
        (backup / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result))
    except Exception:
        if changed_gateway:
            NGINX.write_text(old_nginx)
            run(['docker', 'exec', 'remnawave-nginx', 'nginx', '-t'])
            run(['docker', 'exec', 'remnawave-nginx', 'nginx', '-s', 'reload'])
        run(['docker', 'compose', '-f', str(COMPOSE), 'stop', *SERVICES])
        COMPOSE.write_text(old_compose)
        raise

if __name__ == '__main__':
    main()
