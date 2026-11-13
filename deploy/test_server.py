"""Exercise the actual shell rollout with disposable external-command stand-ins."""
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

SERVER = Path(__file__).with_name('server.sh').resolve()

STUB = r'''
import os
from pathlib import Path
import sys
name = Path(sys.argv[0]).name
args = sys.argv[1:]
root = Path(os.environ['TEST_ROOT'])
with (root / 'calls').open('a') as log:
    log.write(name + ' ' + ' '.join(args) + '\n')
if name == 'git':
    sys.stdout.buffer.write((root / 'source.tar').read_bytes())
elif name == 'python3':
    folder = Path(args[2]) / 'bin'
    folder.mkdir(parents=True)
    (folder / 'python').symlink_to(root / 'bin/python')
elif name == 'python':
    if args == ['-']:
        sys.stdin.read()
    if 'check' in args and os.environ.get('FAIL') == 'preflight':
        sys.exit(1)
    if 'ready' in args and os.environ.get('FAIL') == 'ready' and 'previous' not in args[0]:
        sys.exit(1)
elif name == 'pm2' and args[0] == 'describe':
    sys.exit(1)
'''


class RolloutTests(unittest.TestCase):
    def rollout(self, failure=None):
        with tempfile.TemporaryDirectory(prefix='agrilens-deploy-test-') as temp:
            root = Path(temp)
            (root / 'bin').mkdir()
            stub = root / 'bin/stub'
            stub.write_text('#!' + sys.executable + '\n' + STUB)
            stub.chmod(0o755)
            for name in ('git', 'python3', 'python', 'npm', 'node', 'pm2'):
                (root / 'bin' / name).symlink_to(stub)
            (root / '.env').write_text('HOST=127.0.0.1\n')
            source = root / 'source'
            (source / 'deploy').mkdir(parents=True)
            (source / 'deploy/process.py').touch()
            with tarfile.open(root / 'source.tar', 'w') as archive:
                archive.add(source / 'deploy', arcname='deploy')
            previous = root / '.local/deploy/releases/previous'
            (previous / '.local/mongo-venv/bin').mkdir(parents=True)
            (previous / '.local/mongo-venv/bin/python').symlink_to(root / 'bin/python')
            (root / '.local/deploy/current').symlink_to(previous)
            env = {**os.environ, 'PATH': str(root / 'bin') + ':' + os.environ['PATH'],
                   'PROJECT_NAME': 'agrilens-test', 'TEST_ROOT': str(root), 'FAIL': failure or ''}
            result = subprocess.run(['bash', str(SERVER), 'a' * 40], cwd=root, env=env,
                                    capture_output=True, text=True)
            calls = (root / 'calls').read_text()
            current = (root / '.local/deploy/current').resolve()
            if failure:
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(current, previous)
                self.assertIn('diagnose agrilens-test', calls)
                if failure == 'preflight':
                    self.assertNotIn('pm2 ', calls)
                else:
                    self.assertIn(f'pm2 start {previous}/.local/ecosystem.json', calls)
                    self.assertLess(calls.index('diagnose agrilens-test'), calls.index('pm2 delete agrilens-test'))
            else:
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertNotEqual(current, previous)
                self.assertIn('pm2 save', calls)

    def test_success_selects_new_release(self):
        self.rollout()

    def test_preflight_failure_keeps_current_process(self):
        self.rollout('preflight')

    def test_failed_readiness_restores_previous_process_and_fails(self):
        self.rollout('ready')
