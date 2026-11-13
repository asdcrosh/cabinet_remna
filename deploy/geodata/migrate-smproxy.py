#!/usr/bin/env python3
"""Move only the SMProxy response rule to the verified local geodata mirror."""
import base64
import copy
import datetime
import hashlib
import http.client
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess

MIRROR = 'https://sub.stealthnet.site/geodata/roscomvpn/'

def inspect(name):
    return json.loads(subprocess.run(['docker', 'inspect', name], capture_output=True, text=True, check=True).stdout)[0]

environment = dict(v.split('=', 1) for v in inspect('remnawave-subscription-page')['Config']['Env'] if '=' in v)
address = inspect('remnawave')['NetworkSettings']['Networks']['remnawave-network']['IPAddress']

def api(method, value=None):
    connection = http.client.HTTPConnection(address, 3000, timeout=20)
    connection.request(method, '/api/subscription-settings/', body=json.dumps(value) if value else None, headers={
        'Authorization': 'Bearer ' + environment['REMNAWAVE_API_TOKEN'], 'Content-Type': 'application/json',
        'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '127.0.0.1',
    })
    response = connection.getresponse()
    body = response.read()
    connection.close()
    if response.status != 200: raise RuntimeError('Subscription settings API returned ' + str(response.status))
    return json.loads(body)['response']

def technical_subscription():
    query = "SELECT u.short_uuid FROM users u JOIN internal_squad_members m ON m.user_id=u.id JOIN internal_squads s ON s.uuid=m.internal_squad_uuid WHERE u.status='ACTIVE' AND u.expire_at>now() AND s.name='BlackRoute' ORDER BY u.created_at LIMIT 1;"
    result = subprocess.run(['docker', 'exec', '-i', 'remnawave-db', 'sh', '-c', 'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], input='BEGIN READ ONLY;\n' + query + '\nROLLBACK;\n', capture_output=True, text=True, check=True)
    short_id = result.stdout.strip()
    import re
    assert re.fullmatch('[A-Za-z0-9_-]+', short_id), 'No active entitled subscription for verification'
    return short_id

class LocalHTTPS(http.client.HTTPSConnection):
    def connect(self):
        self.sock = self._context.wrap_socket(socket.create_connection(('127.0.0.1', 443), self.timeout), server_hostname=self.host)

def subscription(short_id, ua):
    connection = LocalHTTPS('sub.stealthnet.site', context=ssl.create_default_context(), timeout=20)
    connection.request('GET', '/' + short_id, headers={'User-Agent': ua, 'Accept': '*/*'})
    response = connection.getresponse()
    body = response.read()
    headers = dict((k.lower(), v) for k, v in response.getheaders())
    connection.close()
    assert response.status == 200 and isinstance(json.loads(body), list), 'Subscription verification failed'
    return body, headers

def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()

def main():
    os.umask(0o077)
    before = api('GET')
    expected = copy.deepcopy(before['responseRules'])
    matching = [r for r in expected['rules'] if r['name'] == 'SMProxy Xray JSON with AUTO']
    assert len(matching) == 1, 'Expected one SMProxy rule'
    headers = matching[0]['responseModifications']['headers']
    routing = next(h for h in headers if h['key'].lower() == 'routing')
    prefix, encoded = routing['value'].split('/onadd/', 1)
    profile = json.loads(base64.b64decode(encoded))
    profile['Geoipurl'] = MIRROR + 'geoip.dat'
    profile['Geositeurl'] = MIRROR + 'geosite.dat'
    profile['LastUpdated'] = str(max(int(datetime.datetime.now(datetime.timezone.utc).timestamp()), int(profile.get('LastUpdated', 0)) + 1))
    routing['value'] = prefix + '/onadd/' + base64.b64encode(json.dumps(profile, ensure_ascii=False, separators=(',', ':')).encode()).decode()
    for key, name in [('geoipurl', 'geoip.dat'), ('geositeurl', 'geosite.dat')]:
        headers[:] = [h for h in headers if h['key'].lower() != key]
        headers.append({'key': key, 'value': MIRROR + name})
    backup = Path('/opt/remnawave-backups/releases') / ('smproxy-geodata-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir(parents=True)
    (backup / 'subscription-settings.before.json').write_text(json.dumps(before, indent=2, ensure_ascii=False) + '\n')
    short_id = technical_subscription()
    agents = ['INCY/1.0', 'Happ/3.8.1/android', 'SMProxy/3.0.4/388-macOS']
    baseline = {ua: subscription(short_id, ua) for ua in agents}
    assert fingerprint(api('GET')) == fingerprint(before), 'Settings changed concurrently'
    api('PATCH', {'uuid': before['uuid'], 'responseRules': expected})
    try:
        after = api('GET')
        assert after['responseRules'] == expected
        assert {k: v for k, v in before.items() if k not in ['responseRules', 'updatedAt']} == {k: v for k, v in after.items() if k not in ['responseRules', 'updatedAt']}
        unchanged = []
        for ua in agents:
            body, actual_headers = subscription(short_id, ua)
            assert body == baseline[ua][0], 'VPN configuration body changed'
            if not ua.startswith('SMProxy/'):
                assert actual_headers.get('routing') == baseline[ua][1].get('routing'), 'Another client routing profile changed'
                unchanged.append(ua)
            else:
                assert actual_headers.get('geoipurl') == MIRROR + 'geoip.dat'
                assert actual_headers.get('geositeurl') == MIRROR + 'geosite.dat'
        for old, new in zip(before['responseRules']['rules'], after['responseRules']['rules']):
            if old['name'] != 'SMProxy Xray JSON with AUTO': assert old == new, 'Another response rule changed'
    except Exception:
        api('PATCH', {'uuid': before['uuid'], 'responseRules': before['responseRules']})
        raise
    result = {'migrated_client': 'SMProxy', 'routing_profile': profile['Name'], 'last_updated': profile['LastUpdated'], 'unchanged_clients': unchanged, 'all_vpn_config_bodies_unchanged': True, 'backup': str(backup)}
    (backup / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))

if __name__ == '__main__':
    main()
