"""Verify fixture transport, provenance labels, and cross-file invariants."""
import collections
import datetime as dt
import json
from pathlib import Path
import threading
import urllib.error
import urllib.request

from fixture_server import make_server

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'fixtures'


def read(name):
    return json.loads((FIXTURES / name).read_text())


def verify():
    manifest = read('cases.json')
    cases = manifest['cases']
    assert {str(p.relative_to(FIXTURES)) for p in FIXTURES.rglob('*.json')} == {'cases.json', *(c['response_file'] for c in cases)}, 'Unreferenced or missing fixture JSON'
    assert 'SYNTHETIC' in manifest['notice']
    crops = read('crops/catalog.json')
    climate = read('climate/daily.json')
    config = read('comparison/config.json')
    catalog = {c['id']: c for c in crops['crops']}
    rows = {r['date']: r for r in climate['daily']}
    assert len(rows) == len(climate['daily']) == 1827
    assert rows['2020-02-29'] and rows['2024-02-29']
    assert list(rows) == sorted(rows)
    yearly = collections.defaultdict(list)
    for date, row in rows.items():
        yearly[dt.date.fromisoformat(date).year].append(row)
    hottest = max(yearly, key=lambda y: (sum(r['tmax_c'] for r in yearly[y]) / len(yearly[y]), -y))
    driest = min(yearly, key=lambda y: (sum(r['rain_mm'] for r in yearly[y]), y))
    assert hottest == climate['scenarios']['hottest_year']['year']
    assert driest == climate['scenarios']['driest_year']['year']

    def heat(anchor):
        total = 0
        for year in [anchor, anchor + 1]:
            for date, row in rows.items():
                day = dt.date.fromisoformat(date)
                summer = day.year == year and day.month in [6, 7, 8]
                winter = (day.year == year and day.month == 12) or (day.year == year + 1 and day.month in [1, 2])
                if (summer or winter) and row['tmax_c'] > 35:
                    total += 1
        return total

    expected_heat = {'average': sum(heat(y) for y in [2020, 2021, 2022]) / 3,
                     'hottest_year': heat(hottest), 'driest_year': heat(driest)}
    matrix = set()
    for case in cases:
        response = read(case['response_file'])
        if case['status'] >= 400:
            assert set(response) == {'error'}
            assert set(response['error']) == {'code', 'message'}
            continue
        if 'plans' not in response:
            continue
        assert 'SYNTHETIC' in response['meta']['warnings'][0]
        plans = response['plans']
        assert 1 <= len(plans) <= 3
        assert plans[0]['id'] == 'baseline'
        assert plans[0]['crops'] == case['request']['body']['baseline']
        assert len({tuple(p['crops']) for p in plans}) == len(plans)
        sources = {s['id'] for s in response['meta']['sources']}
        for plan in plans:
            assert len(plan['crops']) == 4
            assert set(plan['source_ids']) <= sources
            for slot, crop_id in zip(config['slot_order'], plan['crops']):
                assert slot.split('_')[1] in catalog[crop_id]['valid_seasons']
            if case['profile'] != 'missing_metrics':
                assert plan['water_need_mm'] == {key: sum(catalog[c]['water_need_mm'][key] for c in plan['crops']) for key in ['min', 'max']}
                assert plan['hot_days'] == expected_heat[response['scenario']]
            else:
                assert plan['hot_days'] is None
                assert plan['water_need_mm'] == {'min': None, 'max': None}
        if case['profile'] == 'normal':
            assert len(plans) == 3
            matrix.add((response['priority'], response['scenario']))
    assert matrix == {(p, s) for p in config['priorities'] for s in config['scenarios']}
    assert len(read('climate/missing_day.json')['daily']) == 1826
    assert read('climate/missing_day.json')['provenance']['missing_days'] == 1
    # Exercise every recorded case through actual HTTP, on isolated ephemeral ports.
    for service, profile in sorted({(c['service'], c['profile']) for c in cases}):
        server = make_server(service, '127.0.0.1', 0, profile)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            base = f'http://127.0.0.1:{server.server_port}'
            for case in [c for c in cases if c['service'] == service and c['profile'] == profile]:
                req = case['request']
                data = json.dumps(req['body']).encode() if 'body' in req else None
                request = urllib.request.Request(base + req['path'], data=data, method=req['method'],
                                                  headers={'Content-Type': 'application/json', 'Origin': 'http://localhost:5173'})
                try:
                    result = urllib.request.urlopen(request, timeout=3)
                except urllib.error.HTTPError as error:
                    result = error
                with result:
                    assert result.status == case['status'], case['id']
                    assert result.headers['X-AgriLens-Data-Mode'] == 'fixture'
                    assert result.headers['Access-Control-Allow-Origin'] == 'http://localhost:5173'
                    assert json.load(result) == read(case['response_file']), case['id']
            if service == 'comparison' and profile == 'normal':
                bad = urllib.request.Request(base + '/api/compare', data=b'{', method='POST')
                try:
                    urllib.request.urlopen(bad, timeout=3)
                    raise AssertionError('Malformed JSON accepted')
                except urllib.error.HTTPError as error:
                    assert error.code == 400
                    assert json.load(error)['error']['code'] == 'INVALID_INPUT'
                preflight = urllib.request.Request(base + '/api/compare', method='OPTIONS')
                with urllib.request.urlopen(preflight, timeout=3) as result:
                    assert result.status == 200
        finally:
            server.shutdown()
            server.server_close()
            worker.join()
    print(f'PASS: {len(cases)} HTTP cases; 9 priority/scenario combinations; calendar, water, heat, errors, nulls and CORS checks.')


if __name__ == '__main__':
    verify()
