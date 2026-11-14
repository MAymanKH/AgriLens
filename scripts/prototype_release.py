"""Build, import, verify, back up and restore pinned unreviewed backend releases."""
import argparse
import base64
import copy
import datetime as dt
import hashlib
import json
from pathlib import Path
import sys
import tempfile

from bson import json_util
from pymongo import MongoClient
from pymongo.errors import PyMongoError

from build_research_data import ROOT, require
from import_research_data import (collections, environment, import_lock, import_package,
                                  inspect_stored, load_package, settings)

DEFAULT_BUNDLE = ROOT / '.local/backend/release.json'
PIN = ROOT / 'releases/prototype.json'
BASELINE = ['maize', 'wheat', 'maize', 'wheat']


def canonical(value):
    plain = json.loads(json_util.dumps(value, json_options=json_util.CANONICAL_JSON_OPTIONS))
    return json.dumps(plain, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def file_digest(data):
    return hashlib.sha256(data).hexdigest()


def runtime_paths():
    files = [ROOT / 'tools/dev.py', ROOT / 'tools/backend.py', Path(__file__),
             ROOT / '.env.example', ROOT / 'requirements-mongo.txt',
             ROOT / 'scripts/build_research_data.py', ROOT / 'scripts/import_research_data.py',
             ROOT / 'scripts/fetch_and_process_zankalon.py']
    for owner in ('crops', 'climate', 'comparison'):
        folder = ROOT / 'services' / owner
        files.extend((folder / 'src').rglob('*.js'))
        files.extend(folder / name for name in ('package.json', 'package-lock.json', 'start.json', 'index.js')
                     if (folder / name).is_file())
    return sorted(set(path.relative_to(ROOT).as_posix() for path in files))


def build(sample_baseline=None):
    crop, climate, rows = load_package()
    proposal = json.loads((ROOT / 'data/processed/four_crop_proposal.json').read_text())
    require(proposal['region_id'] == crop['region']['id'] == climate['region']['id'], 'Region mismatch')
    require(crop['region']['coordinates'] == climate['region']['coordinates'], 'Coordinate mismatch')
    require(len(proposal['crops']) == 4 and {c['id'] for c in proposal['crops']} ==
            {'maize', 'soybean', 'wheat', 'faba_bean'}, 'Unexpected prototype crop scope')
    source_by_id = {s['id']: s for s in crop['sources']}
    for source in proposal['sources']:
        source_by_id[source['id']] = {
            'id': source['id'], 'url': source['url'], 'title': source_by_id.get(source['id'], {}).get('title', source['location']),
            'supports': source['location'],
        }
    old_crops = {c['id']: c for c in crop['crops']}
    selected = []
    for proposed in proposal['crops']:
        old = old_crops[proposed['id']]
        selected.append({
            **{k: old[k] for k in ('id', 'name', 'family', 'is_legume')},
            **{k: proposed[k] for k in ('valid_seasons', 'grow_window', 'water_need_mm')},
            'source_ids': sorted({value for value in (proposed['water_evidence']['source_id'],
                                                    proposed['calendar_evidence']['source_id']) if value}),
            'evidence_status': 'unreviewed_proposal', 'eligible_for_live': False,
        })
    crop['crops'] = selected
    wanted = {sid for c in selected for sid in c['source_ids']}
    crop['sources'] = [source_by_id[sid] for sid in sorted(wanted)]
    for doc in (crop, climate):
        doc['status'] = 'sealed'
        doc['approval'] = None
        doc['limitations'] = ['UNREVIEWED PROTOTYPE. Scientific review waived by project owner on 2026-11-13.',
                              'Whole-month calendars are proposed envelopes, not exact planting dates.',
                              'Unknown water requirements remain null; no irrigation savings or soil outcomes are predicted.']
    inputs = ['START_HERE.md', 'docs/METHOD.md', 'docs/SOURCES.md', 'data/processed/four_crop_proposal.json',
              'data/processed/crop_catalog.json', 'data/processed/climate_daily_clean.json',
              'data/processed/region_config.json', 'data/fixtures/mock_crop_catalog.json',
              'data/fixtures/mock_climate_response.json', 'data/raw/fao_crop_calendar_EG_delta.json',
              'docs/FOUR_CROP_EVIDENCE.md',
              climate['raw_artifact']['uri']]
    inputs.extend(path.relative_to(ROOT).as_posix() for path in (ROOT / 'docs/research/power_1991_2020').glob('*.json'))
    inputs.extend(path.relative_to(ROOT).as_posix() for path in (ROOT / 'data/processed/mongodb').glob('*') if path.is_file())
    inputs = sorted(set(inputs))
    artifacts = {name: base64.b64encode((ROOT / name).read_bytes()).decode() for name in sorted(set(inputs + runtime_paths()))}
    identity = {
        'format_version': 1, 'data_mode': 'unreviewed', 'region_id': crop['region']['id'],
        'sample_baseline': sample_baseline or BASELINE,
        'inputs': {name: file_digest((ROOT / name).read_bytes()) for name in inputs},
        'runtime': {name: file_digest((ROOT / name).read_bytes()) for name in runtime_paths()},
        'method': 'docs/METHOD.md: whole-month >=35 C; common complete anchors; eligible-anchor stress extremes; deterministic ranking',
        'scientific_status': 'unreviewed; workflow waived, not Research approved',
    }
    release_id = 'prototype-' + digest(identity)[:24]
    crop['_id'] = release_id + '-crops'
    climate['_id'] = release_id + '-climate'
    rows = [{**row, 'dataset_id': climate['_id']} for row in rows]
    package = [crop, climate, rows]
    manifest = {'identity': identity, 'release_id': release_id, 'crop_catalog_id': crop['_id'],
                'climate_dataset_id': climate['_id'], 'package_sha256': package_digest(package)}
    bundle = {'manifest': manifest, 'package': package, 'artifacts': artifacts}
    validate_bundle(bundle)
    return bundle


def package_digest(package):
    crop, climate, rows = copy.deepcopy(package)
    for doc in (crop, climate):
        doc.pop('created_at', None)
    return digest([crop, climate, rows])


def validate_bundle(bundle):
    manifest = bundle['manifest']
    identity = manifest['identity']
    require(identity['format_version'] == 1 and identity['data_mode'] == 'unreviewed', 'Unsupported release format or mode')
    require(manifest['release_id'] == 'prototype-' + digest(identity)[:24], 'Release identity mismatch')
    require(package_digest(bundle['package']) == manifest['package_sha256'], 'Release package checksum mismatch')
    crop, climate, rows = bundle['package']
    require(crop['_id'] == manifest['crop_catalog_id'] == manifest['release_id'] + '-crops' and
            climate['_id'] == manifest['climate_dataset_id'] == manifest['release_id'] + '-climate', 'Pinned snapshot ID mismatch')
    for doc in (crop, climate):
        require(doc['status'] == 'sealed' and doc['kind'] == 'observed' and doc['approval'] is None, 'Release must remain sealed and unreviewed')
        require(doc['region']['id'] == identity['region_id'], 'Release region mismatch')
    require(crop['region'] == climate['region'], 'Snapshot region or coordinate mismatch')
    require(all(row['dataset_id'] == climate['_id'] for row in rows), 'Mixed daily revisions')
    require(len(rows) == climate['validation']['expected_days'], 'Incomplete release rows')
    for name, checksum in {**identity['inputs'], **identity['runtime']}.items():
        content = base64.b64decode(bundle['artifacts'][name], validate=True)
        require(file_digest(content) == checksum, f'Backup artifact checksum mismatch: {name}')
    require(file_digest(base64.b64decode(bundle['artifacts'][climate['raw_artifact']['uri']])) == climate['raw_artifact']['sha256'], 'Raw NASA artifact checksum mismatch')
    return bundle


def check_runtime(bundle):
    for name, checksum in bundle['manifest']['identity']['runtime'].items():
        require((ROOT / name).is_file() and file_digest((ROOT / name).read_bytes()) == checksum,
                f'Runtime differs from pinned release: {name}. Build a new release or restore matching code.')


def read_bundle(path):
    return validate_bundle(json_util.loads(Path(path).read_text(), json_options=json_util.JSONOptions(tz_aware=True)))


def write_bundle(path, bundle):
    validate_bundle(bundle)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', dir=path.parent, prefix=path.name + '.', delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(json_util.dumps(bundle, indent=2, ensure_ascii=False, allow_nan=False) + '\n')
            stream.flush()
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def verify_stored(client, names, bundle):
    stores = collections(client, names)
    inspect_stored(stores, bundle['package'], complete=True)
    return stores


def import_release(client, names, bundle):
    validate_bundle(bundle)
    stores = collections(client, names, install=True)
    crop, climate, rows = bundle['package']
    existing = stores[1].find_one({'_id': climate['_id']})
    if existing and existing['status'] == 'sealed':
        verify_stored(client, names, bundle)
        return
    staged = copy.deepcopy(climate)
    staged['status'] = 'staging'
    # Crop is inserted atomically. Climate remains unservable until all rows match.
    import_package(stores, [crop, staged, rows])
    changed = stores[1].update_one({'_id': climate['_id'], 'status': 'staging', 'approval': None},
                                 {'$set': {'status': 'sealed'}})
    require(changed.modified_count == 1, 'Could not seal complete climate snapshot')
    verify_stored(client, names, bundle)


def backup(client, names, bundle):
    stores = verify_stored(client, names, bundle)
    result = copy.deepcopy(bundle)
    result['package'] = [stores[0].find_one({'_id': bundle['manifest']['crop_catalog_id']}),
                         stores[1].find_one({'_id': bundle['manifest']['climate_dataset_id']}),
                         list(stores[2].find({'dataset_id': bundle['manifest']['climate_dataset_id']}, {'_id': 0}).sort('date', 1))]
    return validate_bundle(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['build', 'import', 'verify', 'backup', 'restore'])
    parser.add_argument('--bundle', type=Path, default=DEFAULT_BUNDLE)
    parser.add_argument('--output', type=Path, help='Backup destination')
    parser.add_argument('--pin', action='store_true', help='Record the built release manifest in releases/prototype.json')
    args = parser.parse_args()
    try:
        if args.command == 'build':
            bundle = build()
            archive = DEFAULT_BUNDLE.parent / 'releases'
            if args.bundle.exists():
                previous = read_bundle(args.bundle)
                prior_path = archive / (previous['manifest']['release_id'] + '.json')
                if not prior_path.exists():
                    write_bundle(prior_path, previous)
            release_path = archive / (bundle['manifest']['release_id'] + '.json')
            if release_path.exists():
                require(read_bundle(release_path)['manifest'] == bundle['manifest'], 'Archived release conflicts with this identity')
            else:
                write_bundle(release_path, bundle)
            write_bundle(args.bundle, bundle)
            if args.pin:
                PIN.parent.mkdir(parents=True, exist_ok=True)
                PIN.write_text(json.dumps(bundle['manifest'], indent=2, sort_keys=True) + '\n')
        else:
            bundle = read_bundle(args.bundle)
            env = environment()
            names, identity = settings(env)
            with import_lock(identity), MongoClient(env['MONGODB_URI'], tz_aware=True, serverSelectionTimeoutMS=2000) as client:
                require(client.server_info()['version'].startswith('8.0.'), 'Use MongoDB Community 8.0')
                if args.command in ('import', 'restore'):
                    import_release(client, names, bundle)
                elif args.command == 'verify':
                    verify_stored(client, names, bundle)
                else:
                    require(args.output is not None, 'backup requires --output')
                    write_bundle(args.output, backup(client, names, bundle))
        print(json.dumps({'status': 'passed', 'operation': args.command, 'release_id': bundle['manifest']['release_id'],
                          'scientific_status': 'unreviewed', 'daily_records': len(bundle['package'][2])}, indent=2))
        return 0
    except (ValueError, KeyError, TypeError, OSError, PyMongoError) as error:
        print(f'Release operation failed: {type(error).__name__ if isinstance(error, PyMongoError) else error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
