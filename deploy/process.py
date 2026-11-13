"""Describe the PM2 supervisor and verify its selected process over real HTTP."""
import json
import re
import socket
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from dev import environment


def config(name):
    return {'apps': [{
        'name': name, 'cwd': str(ROOT), 'script': str(ROOT / 'tools/backend.py'),
        'args': ['run'], 'interpreter': str(ROOT / '.local/mongo-venv/bin/python'),
        'exec_mode': 'fork', 'instances': 1, 'autorestart': True,
        'restart_delay': 3000, 'kill_timeout': 25000,
    }]}


def redact(text, env):
    for key, value in env.items():
        if value and len(value) >= 4 and any(word in key.upper() for word in ('PASSWORD', 'SECRET', 'TOKEN', 'PRIVATE_KEY', 'MONGODB_URI')):
            text = text.replace(value, '<redacted>')
    return re.sub(r'mongodb(?:\+srv)?://[^\s\'"<>]+', '<redacted MongoDB URI>', text)


def ports():
    env = environment()
    host = env.get('HOST', '127.0.0.1')
    target = {'0.0.0.0': '127.0.0.1', '::': '::1'}.get(host, host)
    for key in ('COMPARISON_PORT', 'CLIMATE_PORT', 'CROP_PORT'):
        port = int(env[key])
        try:
            with socket.create_connection((target, port), timeout=1):
                state = 'accepting TCP connections'
        except OSError:
            state = 'not accepting TCP connections'
        print(f'{key}={port}: {state}', flush=True)


def diagnose(name):
    env = environment()
    print('Deployment diagnostics', flush=True)
    ports()
    paths = [ROOT / '.local/backend/logs' / f'{owner}.log'
             for owner in ('crops', 'climate', 'comparison')]
    try:
        processes = json.loads(subprocess.check_output(['pm2', 'jlist'], timeout=10))
        for item in processes:
            if item['name'] != name:
                continue
            details = item['pm2_env']
            summary = {key: details.get(key) for key in
                       ('status', 'restart_time', 'exit_code', 'pm_cwd', 'exec_interpreter', 'pm_exec_path')}
            print(redact(json.dumps(summary), env), flush=True)
            paths.extend(Path(details[key]) for key in ('pm_err_log_path', 'pm_out_log_path') if details.get(key))
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f'PM2 diagnostics unavailable: {type(error).__name__}', flush=True)
    for path in dict.fromkeys(paths):
        print(f'Log: {path}', flush=True)
        try:
            with path.open('rb') as stream:
                stream.seek(0, 2)
                stream.seek(max(0, stream.tell() - 65536))
                tail = stream.read().decode(errors='replace').splitlines()[-80:]
            print(redact('\n'.join(tail), env), flush=True)
        except OSError as error:
            print(f'Log unavailable: {type(error).__name__}', flush=True)


def ready(name, timeout=120):
    env = environment()
    base = f"http://{env['HOST']}:{env['COMPARISON_PORT']}"
    last_error = 'PM2 process not found'
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        processes = json.loads(subprocess.check_output(['pm2', 'jlist']))
        selected = [p['pm2_env'] for p in processes if p['name'] == name]
        if selected:
            last_error = f"PM2 status={selected[0]['status']}, cwd={selected[0].get('pm_cwd')}"
        if len(selected) == 1 and selected[0]['status'] == 'online' and Path(selected[0]['pm_cwd']).resolve() == ROOT:
            try:
                for path in ('/health', '/api/config'):
                    with urllib.request.urlopen(base + path, timeout=5) as response:
                        if response.status != 200 or response.headers.get('X-AgriLens-Data-Mode') != 'unreviewed':
                            raise ValueError('Unexpected backend response')
                        json.load(response)
                print(f'{name} ready at {base}, UNREVIEWED prototype')
                return
            except (OSError, ValueError) as error:
                last_error = f'{path}: {type(error).__name__}: {error}'
        time.sleep(1)
    raise RuntimeError(redact(f'{name} did not become ready at {base}; {last_error}', env))


if __name__ == '__main__':
    command, name = sys.argv[1:]
    if command == 'config':
        print(json.dumps(config(name), indent=2))
    elif command == 'ready':
        ready(name)
    elif command == 'diagnose':
        diagnose(name)
    elif command == 'ports':
        ports()
    else:
        raise SystemExit('Expected config, ready, ports or diagnose')
