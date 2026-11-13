"""Generate deterministic synthetic HTTP examples, never scientific evidence."""
import calendar
import copy
import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'fixtures'
SLOTS = ['y1_summer', 'y1_winter', 'y2_summer', 'y2_winter']
BASELINE = ['summer_a', 'winter_a', 'summer_a', 'winter_a']
WARNING = 'SYNTHETIC DEVELOPMENT FIXTURE. Not NASA measurements or approved agricultural facts.'
SOURCE = {'id': 'fixture_rules', 'title': WARNING, 'url': 'https://example.invalid/agrilens-fixture'}


def write(name, value):
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
    return name


def build():
    cases = []

    def case(name, service, path, response, *, method='GET', body=None, status=200, profile='normal'):
        filename = write(f'{service}/{name}.json', response)
        request = {'method': method, 'path': path}
        if body is not None:
            request['body'] = body
        cases.append({'id': name, 'service': service, 'profile': profile,
                      'request': request, 'status': status, 'response_file': filename})

    def error(name, service, path, code, message, **kw):
        case(name, service, path, {'error': {'code': code, 'message': message}}, **kw)

    crop_rows = []
    for crop_id, water, family, legume in [
        ('summer_a', (100, 200), 'fixture_family_a', False),
        ('summer_b', (60, 100), 'fixture_family_b', True),
        ('winter_a', (80, 120), 'fixture_family_c', False),
        ('winter_b', (50, 70), 'fixture_family_b', True),
    ]:
        summer = crop_id.startswith('summer')
        crop_rows.append({'id': crop_id, 'name': f'Fixture {crop_id}',
                          'valid_seasons': ['summer' if summer else 'winter'],
                          'grow_window': {'start_month': 6 if summer else 12, 'end_month': 8 if summer else 2},
                          'water_need_mm': {'min': water[0], 'max': water[1]},
                          'family': family, 'is_legume': legume, 'source_ids': ['fixture_rules']})
    crops = {'region_id': 'sample_region', 'slot_order': SLOTS, 'crops': crop_rows,
             'sources': [{'id': SOURCE['id'], 'url': SOURCE['url'], 'supports': WARNING}]}
    case('catalog', 'crops', '/internal/crops?region_id=sample_region', crops)
    daily = []
    date = dt.date(2020, 1, 1)
    while date < dt.date(2025, 1, 1):
        daily.append({'date': date.isoformat(), 'tmax_c': {2020: 30, 2021: 40, 2022: 25, 2023: 30, 2024: 30}[date.year],
                      'rain_mm': 0 if date.year == 2022 else 1})
        date += dt.timedelta(days=1)
    climate = {'region_id': 'sample_region', 'coordinates': {'lat': 0, 'lon': 0},
               'period': {'first_year': 2020, 'last_year': 2024},
               'units': {'tmax': 'C', 'rain': 'mm/day'}, 'daily': daily,
               'scenarios': {'hottest_year': {'year': 2021, 'rule': 'Fixture only: greatest annual mean tmax; earliest tie.'},
                             'driest_year': {'year': 2022, 'rule': 'Fixture only: smallest annual rain sum; earliest tie.'}},
               'provenance': {'source_url': SOURCE['url'], 'retrieved_at': '2026-11-13T00:00:00Z',
                              'missing_days': 0, 'spatial_resolution': WARNING, 'time_standard': 'Synthetic daily calendar'}}
    case('daily', 'climate', '/internal/climate?region_id=sample_region', climate)
    missing = copy.deepcopy(climate)
    missing['daily'] = [row for row in missing['daily'] if row['date'] != '2021-07-01']
    missing['provenance']['missing_days'] = 1
    missing['scenarios']['hottest_year']['year'] = None
    missing['scenarios']['hottest_year']['rule'] = 'Fixture only: incomplete 2021 cannot be selected.'
    case('missing_day', 'climate', '/internal/climate?region_id=sample_region', missing, profile='missing_day')
    partial_crops = copy.deepcopy(crops)
    partial_crops['crops'][0]['water_need_mm'] = {'min': None, 'max': None}
    case('missing_water', 'crops', '/internal/crops?region_id=sample_region', partial_crops, profile='missing_water')
    config = {'region': {'id': 'sample_region', 'name': 'SYNTHETIC fixture region'}, 'slot_order': SLOTS,
              'crops_by_season': {season: [{'id': c['id'], 'name': c['name']} for c in crop_rows if season in c['valid_seasons']]
                                  for season in ['summer', 'winter']},
              'priorities': ['water', 'heat', 'soil'], 'scenarios': ['average', 'hottest_year', 'driest_year'],
              'sample_baseline': BASELINE}
    case('config', 'comparison', '/api/config', config)
    request = {'region_id': 'sample_region', 'baseline': BASELINE, 'priority': 'water', 'scenario': 'average'}
    plans = [('baseline', BASELINE), ('water_conscious', ['summer_b', 'winter_b', 'summer_b', 'winter_b']),
             ('diverse', ['summer_a', 'winter_b', 'summer_b', 'winter_a'])]
    water = {c['id']: c['water_need_mm'] for c in crop_rows}

    def hot_days(anchor):
        windows = [(dt.date(anchor, 6, 1), dt.date(anchor, 8, 31)),
                   (dt.date(anchor, 12, 1), dt.date(anchor + 1, 2, calendar.monthrange(anchor + 1, 2)[1])),
                   (dt.date(anchor + 1, 6, 1), dt.date(anchor + 1, 8, 31)),
                   (dt.date(anchor + 1, 12, 1), dt.date(anchor + 2, 2, calendar.monthrange(anchor + 2, 2)[1]))]
        return sum(1 for row in daily if row['tmax_c'] > 35 and
                   any(a.isoformat() <= row['date'] <= b.isoformat() for a, b in windows))

    def comparison(req):
        scenario = req['scenario']
        # Only anchors with two full summers and following winter coverage are eligible.
        hot = sum(hot_days(y) for y in [2020, 2021, 2022]) / 3 if scenario == 'average' else hot_days(2021 if scenario == 'hottest_year' else 2022)
        return {'region_id': 'sample_region', 'priority': req['priority'], 'scenario': scenario,
                'plans': [{'id': identity, 'crops': sequence,
                           'water_need_mm': {k: sum(water[c][k] for c in sequence) for k in ['min', 'max']},
                           'hot_days': hot, 'soil_note': 'Synthetic diversity/legume example; no soil-health prediction.',
                           'reasons': [WARNING, 'Fixture trade-off: water ranges differ; all crops share seasonal windows, so heat exposure ties.'],
                           'source_ids': ['fixture_rules']} for identity, sequence in plans],
                'meta': {'heat_threshold_c': 35, 'climate_period': '2020-2024 SYNTHETIC',
                         'scenario_year': None if scenario == 'average' else (2021 if scenario == 'hottest_year' else 2022),
                         'sources': [SOURCE], 'assumptions': [WARNING, 'Fixture only: strict tmax > 35 C; full calendar months; winter follows its summer.',
                         'Fixture average uses complete two-year anchors 2020, 2021 and 2022; this is not an approved scientific method.'],
                         'limitations': ['No scientific validity. Priority ties are intentional; not a production ranking algorithm.'],
                         'warnings': [WARNING]}}

    for priority in config['priorities']:
        for scenario in config['scenarios']:
            req = dict(request, priority=priority, scenario=scenario)
            case(f'{priority}_{scenario}', 'comparison', '/api/compare', comparison(req), method='POST', body=req)
    error('incomplete_scenario', 'comparison', '/api/compare', 'INSUFFICIENT_DATA',
          'Fixture historical window has missing daily observations.', method='POST',
          body=dict(request, scenario='hottest_year'), status=422, profile='incomplete_scenario')
    for profile, count in [('one_plan', 1), ('two_plans', 2)]:
        response = comparison(request)
        response['plans'] = response['plans'][:count]
        response['meta']['warnings'].append(f'Fixture constraint: only {count - 1} alternatives are eligible in this case.')
        case(profile, 'comparison', '/api/compare', response, method='POST', body=request, profile=profile)
    response = comparison(request)
    for p in response['plans']:
        p['water_need_mm'] = {'min': None, 'max': None}
        p['hot_days'] = None
    response['meta']['warnings'].append('Fixture evidence missing: metrics not evaluated; season validity remains known.')
    case('missing_metrics', 'comparison', '/api/compare', response, method='POST', body=request, profile='missing_metrics')
    invalids = [('unknown_region', {'region_id': 'unknown'}, 'UNKNOWN_REGION', 404),
                ('unknown_crop', {'baseline': ['unknown', *BASELINE[1:]]}, 'INVALID_INPUT', 400),
                ('wrong_season', {'baseline': ['winter_a', *BASELINE[1:]]}, 'INVALID_INPUT', 400),
                ('wrong_slot_count', {'baseline': BASELINE[:3]}, 'INVALID_INPUT', 400),
                ('invalid_priority', {'priority': 'profit'}, 'INVALID_INPUT', 400),
                ('invalid_scenario', {'scenario': 'future'}, 'UNSUPPORTED_SCENARIO', 422)]
    for name, changes, code, status in invalids:
        error(name, 'comparison', '/api/compare', code, f'Fixture: correct {next(iter(changes))}.',
              method='POST', body=dict(request, **changes), status=status)
    error('unavailable_scenario', 'comparison', '/api/compare', 'UNSUPPORTED_SCENARIO',
          'Fixture historical scenario is unavailable.', method='POST', body=dict(request, scenario='hottest_year'), status=422, profile='unsupported_scenario')
    for service, path in [('crops', '/internal/crops'), ('climate', '/internal/climate')]:
        error('unknown_region', service, path + '?region_id=unknown', 'UNKNOWN_REGION', 'This fixture region is not supported.', status=404)
        error('missing_region', service, path, 'INVALID_INPUT', 'Provide region_id.', status=400)
        error('insufficient_data', service, path + '?region_id=sample_region', 'INSUFFICIENT_DATA', 'Fixture core validation evidence is missing.', status=422, profile='insufficient_data')
    error('core_evidence_missing', 'comparison', '/api/compare', 'INSUFFICIENT_DATA',
          'Fixture crop-season evidence is missing; no recommendation can be verified.', method='POST',
          body=request, status=422, profile='insufficient_data')
    error('config_unavailable', 'comparison', '/api/config', 'SERVICE_UNAVAILABLE',
          'Fixture configuration service unavailable. Retry.', status=503, profile='outage')
    for service in ['comparison', 'crops', 'climate']:
        case('health', service, '/health', {'status': 'ok', 'mode': 'fixture', 'service': service})
        path = '/api/compare' if service == 'comparison' else f'/internal/{service}?region_id=sample_region'
        error('service_unavailable', service, path, 'SERVICE_UNAVAILABLE', 'Fixture service outage. Retry.',
              method='POST' if service == 'comparison' else 'GET', body=request if service == 'comparison' else None,
              status=503, profile='outage')
        error('health_unavailable', service, '/health', 'SERVICE_UNAVAILABLE', 'Fixture service outage. Retry.', status=503, profile='outage')
    write('cases.json', {'notice': WARNING, 'cases': cases})


if __name__ == '__main__':
    build()
