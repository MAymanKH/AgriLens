"""Run or check all three backend services using an exact unreviewed release bundle."""
import argparse
import calendar
import datetime as dt
import itertools
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from prototype_release import (DEFAULT_BUNDLE, PIN, check_runtime, read_bundle,
                               settings, verify_stored)
from build_research_data import require
from dev import environment
from pymongo import MongoClient


def request(base, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, headers={'Content-Type': 'application/json'} if data else {})
    try:
        response = urllib.request.urlopen(req, timeout=8)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, json.load(response), response.headers


class Stack:
    def __init__(self, bundle, env=None, log_dir=None):
        check_runtime(bundle)
        self.bundle = bundle
        self.env = {**os.environ, **(environment() if env is None else env)}
        manifest = bundle['manifest']
        self.env.update(DATA_MODE='unreviewed', CROP_CATALOG_ID=manifest['crop_catalog_id'],
                        CLIMATE_DATASET_ID=manifest['climate_dataset_id'], RELEASE_ID=manifest['release_id'],
                        COMPARISON_REGION_ID=manifest['identity']['region_id'],
                        COMPARISON_REGION_NAME=bundle['package'][0]['region']['name'],
                        COMPARISON_SAMPLE_BASELINE=','.join(manifest['identity']['sample_baseline']))
        host = self.env.get('HOST', '127.0.0.1')
        self.urls = {owner: f"http://{host}:{self.env[key]}" for owner, key in
                     [('comparison', 'COMPARISON_PORT'), ('climate', 'CLIMATE_PORT'), ('crops', 'CROP_PORT')]}
        self.env.update(CROP_BASE_URL=self.urls['crops'], CLIMATE_BASE_URL=self.urls['climate'])
        self.log_dir = Path(log_dir or ROOT / '.local/backend/logs')
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.processes = {}
        self.logs = {}

    def start(self, owner):
        require(owner not in self.processes, f'{owner} already started')
        folder = ROOT / 'services' / owner
        command = json.loads((folder / 'start.json').read_text())['command']
        port_key = {'crops': 'CROP_PORT', 'climate': 'CLIMATE_PORT', 'comparison': 'COMPARISON_PORT'}[owner]
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind((self.env.get('HOST', '127.0.0.1'), int(self.env[port_key])))
            except OSError as error:
                raise ValueError(f'{owner} port {self.env[port_key]} is already in use; stop that process or choose another port') from error
        log = (self.log_dir / f'{owner}.log').open('a')
        self.logs[owner] = log
        try:
            self.processes[owner] = subprocess.Popen(command, cwd=folder, env={**self.env, 'PORT': self.env[port_key]},
                                                     stdout=log, stderr=subprocess.STDOUT)
        except BaseException:
            self.logs.pop(owner).close()
            raise

    def ready(self, owner, timeout=20):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            process = self.processes[owner]
            require(process.poll() is None, f'{owner} exited. Inspect {self.log_dir / (owner + ".log")}')
            try:
                if request(self.urls[owner], '/health')[0] == 200:
                    return
            except OSError:
                pass
            time.sleep(.1)
        raise ValueError(f'{owner} readiness timed out. Inspect {self.log_dir / (owner + ".log")}')

    def start_all(self):
        names, _ = settings(self.env)
        with MongoClient(self.env['MONGODB_URI'], tz_aware=True, serverSelectionTimeoutMS=2000) as client:
            verify_stored(client, names, self.bundle)
        for owner in ('crops', 'climate', 'comparison'):
            self.start(owner)
        for owner in ('crops', 'climate', 'comparison'):
            self.ready(owner)
        return self

    def stop(self, owner):
        process = self.processes.pop(owner, None)
        if process:
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=6)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            self.logs.pop(owner).close()

    def close(self):
        for owner in list(reversed(self.processes)):
            self.stop(owner)

    def __enter__(self):
        try:
            return self.start_all()
        except BaseException:
            self.close()
            raise

    def __exit__(self, *_args):
        self.close()


def independent_heat(bundle, crop_ids):
    import base64
    raw_path = bundle['package'][1]['raw_artifact']['uri']
    raw = json.loads(base64.b64decode(bundle['artifacts'][raw_path]))
    temperatures = raw['properties']['parameter']['T2M_MAX']
    crops = {crop['id']: crop for crop in bundle['package'][0]['crops']}
    period = bundle['package'][1]['period']
    totals = []
    for anchor in range(period['first_year'], period['last_year'] + 1):
        total = 0
        complete = True
        for index, crop_id in enumerate(crop_ids):
            window = crops[crop_id]['grow_window']
            year = anchor + index // 2
            start, end = window['start_month'], window['end_month']
            end_year = year + (start > end)
            date = dt.date(year, start, 1)
            final = dt.date(end_year, end, calendar.monthrange(end_year, end)[1])
            while date <= final:
                value = temperatures.get(date.strftime('%Y%m%d'))
                if value is None:
                    complete = False
                    break
                total += value >= 35
                date += dt.timedelta(days=1)
        if complete:
            totals.append(total)
    require(bool(totals), 'Independent example has no complete anchors')
    return sum(totals) / len(totals)


def check(stack):
    manifest = stack.bundle['manifest']
    region = manifest['identity']['region_id']
    base = stack.urls['comparison']
    status, config, headers = request(base, '/api/config')
    require(status == 200 and config['scenarios'] == ['average'], 'Only complete average scenario should be advertised')
    require(headers['X-AgriLens-Data-Mode'] == 'unreviewed' and 'unreviewed' in config['region']['name'], 'Unreviewed disclosure missing')
    baseline = manifest['identity']['sample_baseline']
    require(config['sample_baseline'] == baseline, 'Pinned baseline mismatch')
    crop_by_id = {c['id']: c for c in stack.bundle['package'][0]['crops']}
    result = None
    for priority in ('water', 'heat', 'soil'):
        body = {'region_id': region, 'baseline': baseline, 'priority': priority, 'scenario': 'average'}
        status, result, headers = request(base, '/api/compare', body)
        require(status == 200 and headers['X-AgriLens-Data-Mode'] == 'unreviewed', 'Real comparison failed or lost disclosure')
        require(len(result['plans']) == 3 and len({tuple(p['crops']) for p in result['plans']}) == 3, 'Demo needs three distinct plans')
        require(result['plans'][0]['crops'] == baseline, 'Baseline changed')
        require(any('UNREVIEWED PROTOTYPE' in w for w in result['meta']['warnings']), 'Result must disclose unreviewed evidence')
        sources = {s['id'] for s in result['meta']['sources']}
        for plan in result['plans']:
            require(set(plan['source_ids']) <= sources, 'Source reference does not resolve')
            require(plan['hot_days'] == independent_heat(stack.bundle, plan['crops']), 'Independent raw-series heat calculation differs')
            known = all(crop_by_id[c]['water_need_mm'][key] is not None for c in plan['crops'] for key in ('min', 'max'))
            water = {key: sum(crop_by_id[c]['water_need_mm'][key] for c in plan['crops']) if known else None for key in ('min', 'max')}
            require(plan['water_need_mm'] == water, 'Independent water sum differs')
            for i, crop in enumerate(plan['crops']):
                require(('winter' if i % 2 else 'summer') in crop_by_id[crop]['valid_seasons'], 'Season-incompatible rotation')
    for changes, expected in [({'scenario': 'hottest_year'}, 422), ({'scenario': 'driest_year'}, 422),
                              ({'region_id': 'unknown'}, 404), ({'baseline': ['missing'] * 4}, 400),
                              ({'baseline': ['wheat'] * 4}, 400), ({'priority': 'profit'}, 400)]:
        status, error, _ = request(base, '/api/compare', {**body, **changes})
        require(status == expected and 'error' in error, 'Invalid input or incomplete scenario was accepted')
    # Exercise every possible four-crop input from this catalog without fixture responses.
    count = 0
    for sequence in itertools.product(['maize', 'soybean'], ['wheat', 'faba_bean'], ['maize', 'soybean'], ['wheat', 'faba_bean']):
        status, response, _ = request(base, '/api/compare', {**body, 'baseline': list(sequence)})
        require(status == 200 and response['plans'][0]['crops'] == list(sequence), 'Valid baseline failed integration')
        if 'faba_bean' in sequence:
            require(response['plans'][0]['water_need_mm'] == {'min': None, 'max': None}, 'Unknown faba water was filled')
        count += 1
    require(all(process.poll() is None for process in stack.processes.values()), 'A backend process exited during verification')
    return {'status': 'passed', 'release_id': manifest['release_id'], 'data_mode': 'unreviewed',
            'valid_baselines_checked': count, 'priorities_checked': 3, 'scenario_availability': config['scenarios'],
            'baseline_water_mm': {key: sum(crop_by_id[c]['water_need_mm'][key] for c in baseline) if all(crop_by_id[c]['water_need_mm'][key] is not None for c in baseline) else None for key in ('min', 'max')},
            'baseline_hot_days': independent_heat(stack.bundle, baseline)}


def interrupt(*_args):
    raise KeyboardInterrupt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['run', 'check'])
    parser.add_argument('--bundle', type=Path, default=DEFAULT_BUNDLE)
    args = parser.parse_args()
    try:
        bundle = read_bundle(args.bundle)
        if args.bundle.resolve() == DEFAULT_BUNDLE.resolve():
            require(PIN.is_file() and json.loads(PIN.read_text()) == bundle['manifest'], 'Default bundle differs from releases/prototype.json; rebuild the pinned release')
        for signum in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signum, interrupt)
        with Stack(bundle) as stack:
            report = check(stack)
            print(json.dumps(report, indent=2), flush=True)
            if args.command == 'run':
                print(f"Comparison: {stack.urls['comparison']}; release pinned; UNREVIEWED prototype", flush=True)
                while True:
                    for owner, process in stack.processes.items():
                        require(process.poll() is None, f'{owner} exited; stopping stack')
                    time.sleep(.2)
        return 0
    except KeyboardInterrupt:
        return 0
    except Exception as error:
        # Driver exceptions may contain connection details. Keep startup failures safe.
        print(f'Backend failed: {error if isinstance(error, (ValueError, OSError)) else type(error).__name__}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
