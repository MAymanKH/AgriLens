"""Check both live HTTP adapters against the shared Python MongoDB importer.

Run with the dependencies in requirements-mongo.txt, MongoDB 8.0 and npm ci
completed for both services. Only randomly named *_fixtures databases are used.
"""

import datetime as dt
import json
import os
import signal
import socket
import subprocess
import sys
import time
import unittest
import urllib.error
import urllib.request
import uuid

from pymongo import MongoClient

from import_research_data import ROOT, collections, environment, import_package, load_package


def request(url):
    try:
        response = urllib.request.urlopen(url, timeout=3)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, json.load(response), response.headers


class BackendServicesTests(unittest.TestCase):
    def test_imported_staging_is_never_served_as_approved_http_data(self):
        env = environment()
        tag = uuid.uuid4().hex
        names = [f"backend_{tag}_{owner}_fixtures" for owner in ("crops", "climate")]
        processes = []
        with MongoClient(env['MONGODB_URI'], tz_aware=True, serverSelectionTimeoutMS=2000) as client:
            try:
                package = load_package()
                stores = collections(client, names, install=True)
                import_package(stores, package)
                env.update(CROP_DB_NAME=names[0], CLIMATE_DB_NAME=names[1],
                           CROP_CATALOG_ID=package[0]['_id'], CLIMATE_DATASET_ID=package[1]['_id'], DATA_MODE='live')
                for service, port_key, region in [
                    ('crops', 'CROP_PORT', package[0]['region']['id']),
                    ('climate', 'CLIMATE_PORT', package[1]['region']['id']),
                ]:
                    with socket.socket() as sock:
                        sock.bind(('127.0.0.1', 0))
                        port = sock.getsockname()[1]
                    service_env = {**os.environ, **env, 'HOST': '127.0.0.1', port_key: str(port)}
                    process = subprocess.Popen([sys.executable, str(ROOT / 'tools/dev.py'), 'run', service],
                                               env=service_env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
                    processes.append(process)
                    base = f'http://127.0.0.1:{port}'
                    deadline = time.monotonic() + 10
                    while True:
                        try:
                            health, body, _ = request(base + '/health')
                            break
                        except OSError:
                            self.assertIsNone(process.poll(), 'Service exited before HTTP startup')
                            self.assertLess(time.monotonic(), deadline, 'Service startup timed out')
                            time.sleep(.05)
                    self.assertEqual(health, 503)
                    self.assertEqual(body['error']['code'], 'SERVICE_UNAVAILABLE')
                    status, body, headers = request(f'{base}/internal/{service}?region_id={region}')
                    self.assertEqual(status, 422)
                    self.assertEqual(body['error']['code'], 'INSUFFICIENT_DATA')
                    self.assertEqual(headers['Cache-Control'], 'no-store')
                    self.assertEqual(headers['X-AgriLens-Data-Mode'], 'live')
                    status, body, _ = request(f'{base}/internal/{service}?region_id=unknown')
                    self.assertEqual((status, body['error']['code']), (404, 'UNKNOWN_REGION'))
                    status, body, _ = request(f'{base}/internal/{service}?region_id=a&region_id=b')
                    self.assertEqual((status, body['error']['code']), (400, 'INVALID_INPUT'))
                    # Invented approval records are confined to this disposable
                    # test database. They do not approve the research package.
                    approval = {'research_record': 'TEST ONLY', 'technical_record': 'TEST ONLY',
                                'approved_at': dt.datetime.now(dt.timezone.utc)}
                    changes = {'status': 'approved', 'approval': approval}
                    store = stores[0 if service == 'crops' else 1]
                    if service == 'crops':
                        fixture = json.loads((ROOT / 'fixtures/crops/catalog.json').read_text())
                        changes.update(crops=fixture['crops'], sources=[
                            dict(source, title='TEST ONLY') for source in fixture['sources']])
                    store.update_one({'_id': package[0 if service == 'crops' else 1]['_id']}, {'$set': changes})
                    status, body, _ = request(f'{base}/internal/{service}?region_id={region}')
                    self.assertEqual(status, 200)
                    self.assertEqual(body['region_id'], region)
                    self.assertNotIn('approval', body)
                    self.assertNotIn('_id', body)
                    if service == 'climate':
                        self.assertEqual(len(body['daily']), len(package[2]))
                        expected = {key: package[2][0][key] for key in ('date', 'tmax_c', 'rain_mm')}
                        self.assertEqual(body['daily'][0], expected)
                    else:
                        self.assertEqual(body['crops'], fixture['crops'])
                    self.assertEqual(request(base + '/health')[0], 200)
            finally:
                for process in processes:
                    process.send_signal(signal.SIGINT)
                    try:
                        _, stderr = process.communicate(timeout=6)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.communicate()
                        self.fail('Service failed to shut down')
                    self.assertEqual(process.returncode, 0, stderr)
                for name in names:
                    client.drop_database(name)


if __name__ == '__main__':
    unittest.main()
