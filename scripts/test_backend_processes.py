"""Service shutdown must release ports opened by command-wrapper descendants."""
import json
import os
from pathlib import Path
import signal
import socket
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import backend
from prototype_release import build


def listening(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=.1):
            return True
    except OSError:
        return False


@unittest.skipUnless(os.name == 'posix', 'Deployment process groups require POSIX')
class ProcessCleanupTests(unittest.TestCase):
    def test_stopping_wrapper_also_stops_its_listening_child(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            folder = root / 'services/crops'
            folder.mkdir(parents=True)
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0))
                port = sock.getsockname()[1]
            child = ('import socket,time; s=socket.socket(); '
                     f's.bind(("127.0.0.1",{port})); s.listen(); time.sleep(60)')
            marker = root / 'child.pid'
            child_command = [sys.executable, '-c', child]
            wrapper = ('import subprocess,time,pathlib; '
                       f'p=subprocess.Popen({child_command!r}); '
                       f'pathlib.Path({str(marker)!r}).write_text(str(p.pid)); time.sleep(60)')
            (folder / 'start.json').write_text(json.dumps({'command': [sys.executable, '-c', wrapper]}))
            stack = backend.Stack(build(), env={'HOST': '127.0.0.1', 'CROP_PORT': str(port),
                                  'CLIMATE_PORT': '1', 'COMPARISON_PORT': '2'}, log_dir=root / 'logs')
            try:
                with patch.object(backend, 'ROOT', root):
                    stack.start('crops')
                    deadline = time.monotonic() + 5
                    while not listening(port) and time.monotonic() < deadline:
                        time.sleep(.02)
                    self.assertTrue(listening(port), 'Child did not open its port')
                    stack.stop('crops')
                    deadline = time.monotonic() + 2
                    while listening(port) and time.monotonic() < deadline:
                        time.sleep(.02)
                    self.assertFalse(listening(port), 'Wrapper shutdown left its child listening')
            finally:
                stack.close()
                if marker.exists():
                    try:
                        os.kill(int(marker.read_text()), signal.SIGTERM)
                    except ProcessLookupError:
                        pass
