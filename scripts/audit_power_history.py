"""Download and audit a research-only NASA POWER daily reference period.

Run: python scripts/audit_power_history.py
Outputs are candidate research artifacts; this command does not approve or publish them.
"""
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'docs/research/power_1991_2020'
VARIABLES = ('T2M_MAX', 'T2M_MIN', 'RH2M', 'PRECTOTCORR', 'ALLSKY_SFC_SW_DWN', 'WS2M')
UNITS = ('C', 'C', '%', 'mm/day', 'MJ/m^2/day', 'm/s')


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON key: ' + key)
        result[key] = value
    return result


def validate_chunk(payload, first, last):
    raw = json.loads(payload, object_pairs_hook=unique_object)
    parameters = raw['properties']['parameter']
    header = raw['header']
    if header['start'] != f'{first}0101' or header['end'] != f'{last}1231':
        raise ValueError('Wrong raw period metadata')
    fill = header['fill_value']
    if type(fill) not in (int, float) or not math.isfinite(fill):
        raise ValueError('Invalid fill-value metadata')
    coords = raw['geometry']['coordinates']
    if raw['geometry']['type'] != 'Point' or len(coords) < 2 or any(
            type(v) not in (int, float) or not math.isfinite(v) or abs(v-target) > .00051
            for v, target in zip(coords[:2], (31.43332, 30.58057))):
        raise ValueError('Wrong cached point coordinates')
    start, end = dt.date(first, 1, 1), dt.date(last, 12, 31)
    expected = {(start + dt.timedelta(days=i)).strftime('%Y%m%d')
                for i in range((end-start).days+1)}
    if raw['header']['time_standard'] != 'LST':
        raise ValueError('Wrong time standard')
    fields = {}
    for variable, unit in zip(VARIABLES, UNITS):
        values = parameters[variable]
        if set(values) != expected:
            raise ValueError(variable + ': missing or unexpected dates')
        if raw['parameters'][variable]['units'] != unit:
            raise ValueError(variable + ': unexpected units')
        if any(type(v) not in (int, float) or not math.isfinite(v)
               or v == raw['header']['fill_value'] or v == -999 for v in values.values()):
            raise ValueError(variable + ': invalid or missing measurement')
        if variable in ('PRECTOTCORR', 'WS2M', 'ALLSKY_SFC_SW_DWN') and min(values.values()) < 0:
            raise ValueError(variable + ': negative physical quantity')
        if variable == 'RH2M' and not all(0 <= v <= 100 for v in values.values()):
            raise ValueError('Humidity outside 0–100%')
        fields[variable] = {'expected': len(expected), 'valid': len(values),
                            'missing_dates': 0, 'invalid_values': 0, 'unit': unit}
    if any(parameters['T2M_MIN'][d] > parameters['T2M_MAX'][d] for d in expected):
        raise ValueError('Tmin exceeds Tmax')
    return raw, expected, fields


def write_audit(path, audit):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(audit, indent=2)+'\n', encoding='utf-8')
    temporary.replace(path)


def run(output=OUTPUT):
    output.mkdir(parents=True, exist_ok=True)
    audit = {'status': 'research_audit_in_progress', 'scientific_approval': 'pending',
             'request_coordinates': {'lat': 30.58057, 'lon': 31.43332},
             'period': {'start': '1991-01-01', 'end': '2020-12-31'}, 'chunks': []}
    previous_path = output / 'audit.json'
    previous = json.loads(previous_path.read_text(encoding='utf-8')) if previous_path.exists() else {}
    prior_chunks = {chunk['raw_file']: chunk for chunk in previous.get('chunks', [])}
    all_dates = set()
    for first, last in ((1991, 2000), (2001, 2010), (2011, 2020)):
        query = {'parameters': ','.join(VARIABLES), 'community': 'AG',
                 'longitude': 31.43332, 'latitude': 30.58057,
                 'start': f'{first}0101', 'end': f'{last}1231',
                 'format': 'JSON', 'time-standard': 'LST'}
        url = 'https://power.larc.nasa.gov/api/temporal/daily/point?' + urllib.parse.urlencode(query)
        path = output / f'raw_{first}_{last}.json'
        prior = prior_chunks.get(path.name, {})
        if path.exists():
            payload = path.read_bytes()
            retrieval = 'existing local artifact; original retrieval time not inferred'
        else:
            with urllib.request.urlopen(url, timeout=55) as response:
                payload = response.read()
            retrieval = dt.datetime.now(dt.timezone.utc).isoformat()
        if prior.get('request_url') and prior['request_url'] != url:
            raise ValueError(path.name + ': cached request identity changed')
        checksum = hashlib.sha256(payload).hexdigest()
        if prior.get('sha256') and prior['sha256'] != checksum:
            raise ValueError(path.name + ': cached checksum changed; restore or explicitly review as a new revision')
        if prior.get('sha256') == checksum and prior.get('retrieved_at_utc'):
            retrieval = prior['retrieved_at_utc']
        raw, expected, fields = validate_chunk(payload, first, last)
        if all_dates & expected:
            raise ValueError('Overlapping chunks')
        if not path.exists():
            path.write_bytes(payload)
        all_dates.update(expected)
        audit['chunks'].append({'request_url': url, 'raw_file': path.name,
                                 'retrieved_at_utc': retrieval,
                                 'sha256': hashlib.sha256(payload).hexdigest(),
                                 'header': raw['header'], 'response_geometry': raw.get('geometry'),
                                 'variables': fields})
        print(f'{first}-{last}: PASS, {len(expected)} days x {len(VARIABLES)} variables', flush=True)
    audit.update(status='coverage_and_basic_QA_passed', expected_days=10958,
                 actual_days=len(all_dates), leap_days=sum(d.endswith('0229') for d in all_dates),
                 measurements=len(all_dates)*len(VARIABLES),
                 limitations=['Coverage is not station accuracy or scientific approval.',
                              'Solar source transition requires methodological review.',
                              'Four-slot anchor windows require data through anchor+2.'])
    if len(all_dates) != 10958:
        raise ValueError('Incomplete thirty-year record')
    write_audit(output / 'audit.json', audit)
    print(json.dumps({k: audit[k] for k in ('status', 'actual_days', 'leap_days', 'measurements')}))


def main(output=OUTPUT):
    previous_path = output / 'audit.json'
    previous = {}
    try:
        output.mkdir(parents=True, exist_ok=True)
        if previous_path.exists():
            previous = json.loads(previous_path.read_text(encoding='utf-8'), object_pairs_hook=unique_object)
        write_audit(previous_path, dict(previous, status='research_audit_in_progress',
                                        scientific_approval='pending'))
        run(output)
    except (ValueError, KeyError, TypeError, OSError) as error:
        failure = dict(previous, status='audit_failed', scientific_approval='pending', error=str(error))
        write_audit(previous_path, failure)
        raise SystemExit(f'AUDIT FAILED: {error}')


if __name__ == '__main__':
    main()
