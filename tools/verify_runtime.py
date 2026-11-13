"""Exercise the shared launcher independently of Node.js, .NET and MongoDB."""
import contextlib
import io
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest.mock
import urllib.request

import dev

ROOT = Path(__file__).resolve().parents[1]


def verify():
    with tempfile.TemporaryDirectory(prefix='agrilens-runtime-') as directory:
        root = Path(directory)
        (root / '.env.example').write_text('HOST=127.0.0.1\nCLIMATE_PORT=8001\nRELEASE_ID=default\n')
        (root / '.env').write_text('RELEASE_ID=local\n')
        with unittest.mock.patch.object(dev, 'ROOT', root), unittest.mock.patch.dict(os.environ, {'RELEASE_ID': 'process'}):
            assert dev.environment()['RELEASE_ID'] == 'process'
            service = root / 'services' / 'climate'
            service.mkdir(parents=True)
            output = root / 'result.json'
            code = 'import os,json,pathlib;pathlib.Path(' + repr(str(output)) + ').write_text(json.dumps({k:os.environ[k] for k in ["PORT","ASPNETCORE_URLS","RELEASE_ID"]}))'
            (service / 'start.json').write_text(json.dumps({'command': [sys.executable, '-c', code]}))
            with unittest.mock.patch.object(sys, 'argv', ['dev.py', 'run', 'climate']):
                assert dev.main() == 0
            assert json.loads(output.read_text()) == {'PORT': '8001', 'ASPNETCORE_URLS': 'http://127.0.0.1:8001', 'RELEASE_ID': 'process'}
            with unittest.mock.patch.object(sys, 'argv', ['dev.py', 'mongo']), unittest.mock.patch.object(dev.shutil, 'which', return_value=None), contextlib.redirect_stderr(io.StringIO()):
                try:
                    dev.main()
                    raise AssertionError('Missing mongod accepted')
                except SystemExit as error:
                    assert error.code == 2
    sockets = [socket.socket() for _ in range(3)]
    for sock in sockets:
        sock.bind(('127.0.0.1', 0))
    ports = [sock.getsockname()[1] for sock in sockets]
    for sock in sockets:
        sock.close()
    env = dict(os.environ, **dict(zip(['COMPARISON_PORT', 'CLIMATE_PORT', 'CROP_PORT'], map(str, ports))))
    process = subprocess.Popen([sys.executable, str(ROOT / 'tools/dev.py'), 'fixtures'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    try:
        for port in ports:
            deadline = time.monotonic() + 10
            while True:
                try:
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=.5) as result:
                        assert json.load(result)['mode'] == 'fixture'
                    break
                except OSError:
                    assert time.monotonic() < deadline, 'Fixture launcher did not become ready'
                    time.sleep(.05)
    finally:
        process.send_signal(signal.SIGINT)
        _, stderr = process.communicate(timeout=5)
        assert process.returncode == 0, stderr
    for port in ports:
        with socket.socket() as sock:
            assert sock.connect_ex(('127.0.0.1', port)) != 0, 'Orphaned listener'
    blocked = subprocess.run([sys.executable, str(ROOT / 'tools/fixture_server.py'), 'climate', '--port', '0'],
                             env=dict(os.environ, DATA_MODE='live'), capture_output=True, text=True)
    assert blocked.returncode != 0 and 'requires explicit DATA_MODE=fixture' in blocked.stderr
    print('PASS: command-array startup, environment precedence, .NET URL mapping, 3 fixture processes, shutdown, and fixture/live isolation.')


if __name__ == '__main__':
    verify()
