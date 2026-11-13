"""Stable local commands without choosing service languages or frameworks."""
import argparse
import os
import json
import shutil
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
SERVICES = {'comparison': 'COMPARISON', 'climate': 'CLIMATE', 'crops': 'CROP'}


def environment():
    env = {}
    for path in [ROOT / '.env.example', ROOT / '.env']:
        if path.exists():
            for line in path.read_text().splitlines():
                if line.strip() and not line.lstrip().startswith('#'):
                    key, value = line.split('=', 1)
                    env[key.strip()] = value.strip()
    env.update(os.environ)
    return env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['fixtures', 'run', 'mongo', 'import-data', 'verify-data'])
    parser.add_argument('service', choices=['all', *SERVICES], default='all', nargs='?')
    parser.add_argument('--profile', default='normal')
    args = parser.parse_args()
    if args.command in {'import-data', 'verify-data'}:
        try:
            import pymongo
        except ImportError:
            parser.error('Install the local tooling dependency: python -m pip install -r requirements-mongo.txt. See docs/database/local-import.md.')
        cmd = [sys.executable, str(ROOT / 'scripts/import_research_data.py')]
        if args.command == 'verify-data':
            cmd.append('--verify')
        return subprocess.call(cmd, cwd=ROOT, env=environment())
    if args.command == 'mongo':
        env = environment()
        binary = shutil.which(env.get('MONGOD_BIN', 'mongod'))
        if binary is None:
            parser.error('Native mongod is not installed. Install MongoDB Community 8.0 or set MONGOD_BIN to its executable. See docs/RUNTIME.md.')
        data = ROOT / '.local' / 'mongo'
        data.mkdir(parents=True, exist_ok=True)
        os.execv(binary, [binary, '--dbpath', str(data), '--bind_ip', '127.0.0.1',
                         '--port', env['MONGODB_PORT'], '--wiredTigerCacheSizeGB', '0.25'])
    if args.command == 'run' and args.service == 'all':
        parser.error('Run one real service per terminal.')
    env = environment()
    children = []
    try:
        for service in SERVICES if args.service == 'all' else [args.service]:
            service_env = dict(env, PORT=env[f'{SERVICES[service]}_PORT'])
            service_env['ASPNETCORE_URLS'] = f"http://{env['HOST']}:{service_env['PORT']}"
            if args.command == 'fixtures':
                service_env['DATA_MODE'] = 'fixture'
                cmd = [sys.executable, str(ROOT / 'tools/fixture_server.py'), service,
                       '--host', env['HOST'], '--port', service_env['PORT'], '--profile', args.profile]
                cwd = ROOT
            else:
                cwd = ROOT / 'services' / service
                entry = cwd / 'start.json'
                if not entry.is_file():
                    parser.error(f'{entry.relative_to(ROOT)} is not implemented. Owner supplies a command array. Use fixtures meanwhile.')
                try:
                    cmd = json.loads(entry.read_text())['command']
                    if not isinstance(cmd, list) or not cmd or any(not isinstance(arg, str) or not arg for arg in cmd):
                        raise ValueError('command must be a nonempty array of strings')
                except (ValueError, KeyError, TypeError) as error:
                    parser.error(f'Invalid {entry.relative_to(ROOT)}: {error}')
            children.append(subprocess.Popen(cmd, cwd=cwd, env=service_env))
        while all(child.poll() is None for child in children):
            time.sleep(0.1)
        return next((child.returncode for child in children if child.returncode is not None), 1)
    except OSError as error:
        parser.error(str(error))
    except KeyboardInterrupt:
        return 0
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()
        for child in children:
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


if __name__ == '__main__':
    sys.exit(main())
