import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deployment_process', Path(__file__).with_name('process.py'))
process = importlib.util.module_from_spec(spec)
spec.loader.exec_module(process)


class ReadinessTests(unittest.TestCase):
    def test_process_supervises_exact_release_with_graceful_shutdown(self):
        app = process.config('agrilens')['apps'][0]
        self.assertEqual(app['cwd'], str(process.ROOT))
        self.assertEqual(app['script'], str(process.ROOT / 'tools/backend.py'))
        self.assertEqual(app['args'], ['run'])
        self.assertGreater(app['kill_timeout'], 18000)
        self.assertEqual(app['instances'], 1)

    def ready(self, cwd=None, status='online', mode='unreviewed', http_failure=False):
        listing = [{'name': 'agrilens', 'pm2_env': {'status': status, 'pm_cwd': str(cwd or process.ROOT)}}]
        def response(*args, **kwargs):
            if http_failure:
                raise OSError('Backend unavailable')
            result = io.BytesIO(b'{"status":"ok"}')
            result.status = 200
            result.headers = {'X-AgriLens-Data-Mode': mode}
            return result
        with patch.object(process.subprocess, 'check_output', return_value=json.dumps(listing)), \
             patch.object(process, 'environment', return_value={'HOST': '127.0.0.1', 'COMPARISON_PORT': '8000'}), \
             patch.object(process.urllib.request, 'urlopen', side_effect=response) as http, \
             patch.object(process.time, 'monotonic', side_effect=[0, 0, 2]), \
             patch.object(process.time, 'sleep'):
            process.ready('agrilens', timeout=1)
            self.assertEqual(http.call_count, 2)

    def test_checks_both_http_endpoints(self):
        self.ready()

    def test_old_process_crashes_outages_and_fixture_fallback_cannot_pass(self):
        for settings in [{'cwd': '/tmp/previous'}, {'status': 'errored'},
                         {'mode': 'fixture'}, {'http_failure': True}]:
            with self.subTest(settings=settings), self.assertRaises(RuntimeError):
                self.ready(**settings)


if __name__ == '__main__':
    unittest.main()
