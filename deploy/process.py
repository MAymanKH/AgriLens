"""Describe the PM2 supervisor and verify its selected process over real HTTP."""
import json
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


def ready(name, timeout=120):
    env = environment()
    base = f"http://{env['HOST']}:{env['COMPARISON_PORT']}"
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        processes = json.loads(subprocess.check_output(['pm2', 'jlist']))
        selected = [p['pm2_env'] for p in processes if p['name'] == name]
        if len(selected) == 1 and selected[0]['status'] == 'online' and Path(selected[0]['pm_cwd']).resolve() == ROOT:
            try:
                for path in ('/health', '/api/config'):
                    with urllib.request.urlopen(base + path, timeout=5) as response:
                        if response.status != 200 or response.headers.get('X-AgriLens-Data-Mode') != 'unreviewed':
                            raise ValueError('Unexpected backend response')
                        json.load(response)
                print(f'{name} ready at {base}, UNREVIEWED prototype')
                return
            except (OSError, ValueError):
                pass
        time.sleep(1)
    raise RuntimeError(f'{name} did not become ready; inspect pm2 logs')


if __name__ == '__main__':
    command, name = sys.argv[1:]
    if command == 'config':
        print(json.dumps(config(name), indent=2))
    elif command == 'ready':
        ready(name)
    else:
        raise SystemExit('Expected config or ready')
