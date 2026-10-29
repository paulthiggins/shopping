#!/usr/bin/env python3
"""Isolated container smoke test; no gateway, production data or certificate requests."""
import argparse
import base64
import json
import os
from pathlib import Path
import secrets
import subprocess
import tarfile
import tempfile
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--bundle', required=True)
parser.add_argument('--compose', default='docker')
args = parser.parse_args()
compose_cli = ['docker', 'compose'] if args.compose == 'docker' else [args.compose]
project = 'shopping-smoke-' + secrets.token_hex(4)
network = project + '-proxy'
env = dict(os.environ, RELEASE_ID=project, APP_ORIGIN='http://127.0.0.1')

def run(cmd, **kwargs):
    return subprocess.run(cmd, check=True, text=True, **kwargs)

with tempfile.TemporaryDirectory(prefix='shopping-smoke-') as directory:
    root = Path(directory)
    with tarfile.open(args.bundle) as archive:
        members = archive.getnames()
        assert not any('reference/' in m or 'data/' in m or 'gateway/' in m or 'node_modules/' in m for m in members)
        archive.extractall(root, filter='data')
    config = json.loads(run(compose_cli + ['-p', project, '-f', str(root/'setup/compose.yaml'), 'config', '--format', 'json'], env=env, capture_output=True).stdout)
    config['name'] = project
    config['networks']['proxy']['name'] = network
    config['volumes']['shopping_data']['name'] = project + '-data'
    config['networks']['test-access'] = {}
    config['services']['web']['networks']['test-access'] = {}
    config['services']['web']['ports'] = [{'target': 8080, 'published': '0', 'host_ip': '127.0.0.1', 'protocol': 'tcp'}]
    config['services']['api']['environment']['APP_ORIGIN'] = 'https://shopping.paulhiggins.cloud'
    compose_file = root/'compose.json'
    compose_file.write_text(json.dumps(config))
    compose = compose_cli + ['-p', project, '-f', str(compose_file)]
    try:
        run(['docker', 'network', 'create', '--internal', network], capture_output=True)
        for service in ['api', 'web']:
            run(['docker', 'build', '-t', config['services'][service]['image'], str(root/'content'/service)], stdout=subprocess.DEVNULL)
        run(compose + ['up', '-d', '--wait', '--wait-timeout', '120'])
        cid = run(compose + ['ps', '--quiet', 'web'], capture_output=True).stdout.strip()
        mapped = json.loads(run(['docker','inspect',cid],capture_output=True).stdout)[0]['NetworkSettings']['Ports']['8080/tcp'][0]
        base = 'http://127.0.0.1:' + mapped['HostPort']
        token = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip('=')
        def request(path, payload=None, authorised=True):
            headers = {'Content-Type': 'application/json', 'Origin': 'https://shopping.paulhiggins.cloud'}
            if authorised:
                headers['Authorization'] = 'Bearer ' + token
            data = json.dumps(payload).encode() if payload is not None else None
            with urllib.request.urlopen(urllib.request.Request(base+path, data=data, headers=headers), timeout=8) as response:
                return response.status, dict(response.headers), response.read()
        try:
            urllib.request.urlopen(urllib.request.Request(base+'/api/state',headers={'Authorization':'Bearer '+token,'Origin':'https://wrong.example'}),timeout=8)
            raise AssertionError('Unexpected origin was allowed')
        except urllib.error.HTTPError as error:
            assert error.code == 403
        assert request('/healthz')[0] == 200
        assert request('/api/healthz')[0] == 200
        state = json.loads(request('/api/collections', {'token': token, 'requestId': secrets.token_hex(16)}, False)[2])['state']
        command = {'id': secrets.token_hex(16), 'epoch': state['epoch'], 'action': {'type': 'item.add', 'id': 'synthetic', 'shopId': state['shops'][0]['id'], 'name': 'Synthetic apples', 'quantity': 2, 'historyRevision': 0}}
        stream = urllib.request.urlopen(urllib.request.Request(base+'/api/events', headers={'Authorization':'Bearer '+token}), timeout=8)
        while not stream.readline().startswith(b'data:'):
            pass
        stream.readline()
        request('/api/commands', command)
        assert stream.readline().startswith(b'data: 1')
        stream.close()
        request('/api/commands', command)
        assert json.loads(request('/api/state')[2])['state']['items'][0]['quantity'] == 2
        try:
            request('/api/state', authorised=False)
            raise AssertionError('Unauthenticated access succeeded')
        except urllib.error.HTTPError as error:
            assert error.code == 404
        try:
            request('/assets/missing.js')
            raise AssertionError('Missing asset returned success')
        except urllib.error.HTTPError as error:
            assert error.code == 404
        run(compose + ['exec', '-T', 'api', 'node', 'server/backup.ts', '/data/backups/smoke.sqlite'])
        run(compose + ['restart', 'api', 'web'])
        run(compose + ['up', '-d', '--wait', '--wait-timeout', '120'])
        mapped = json.loads(run(['docker','inspect',cid],capture_output=True).stdout)[0]['NetworkSettings']['Ports']['8080/tcp'][0]
        base = 'http://127.0.0.1:' + mapped['HostPort']
        assert json.loads(request('/api/state')[2])['state']['items'][0]['quantity'] == 2
        for service in ['web', 'api']:
            cid = run(compose + ['ps', '--quiet', service], capture_output=True).stdout.strip()
            inspected = json.loads(run(['docker','inspect',cid],capture_output=True).stdout)[0]
            assert inspected['HostConfig']['ReadonlyRootfs']
            assert inspected['Config']['User'] in ['node','10001:10001']
        print('PASS: app-only bundle, non-root read-only containers, health, HTTP API, SSE through Caddy, access scope, idempotency, backup and persistent restart.')
    finally:
        run(compose + ['down', '--volumes', '--remove-orphans'], stdout=subprocess.DEVNULL)
        subprocess.run(['docker', 'network', 'rm', network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for service in ['api', 'web']:
            subprocess.run(['docker', 'image', 'rm', config['services'][service]['image']], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
