"""Offline regression tests for historical reference provenance and validation."""
import contextlib
import copy
import io
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError

import audit_power_history as audit


class HistoryAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = json.loads((audit.OUTPUT/'raw_1991_2000.json').read_bytes())

    def test_corrupt_inputs_are_rejected(self):
        for mutation in ('location', 'period', 'timezone', 'units', 'missing_variable',
                         'missing_leap_day', 'null', 'nan', 'sentinel', 'humidity', 'inverted_temperature'):
            with self.subTest(mutation=mutation):
                raw = copy.deepcopy(self.raw)
                p = raw['properties']['parameter']
                if mutation == 'location': raw['geometry']['coordinates'][0] = 30.9388
                elif mutation == 'period': raw['header']['start'] = '19810101'
                elif mutation == 'timezone': raw['header']['time_standard'] = 'UTC'
                elif mutation == 'units': raw['parameters']['T2M_MAX']['units'] = 'K'
                elif mutation == 'missing_variable': del p['RH2M']
                elif mutation == 'missing_leap_day': del p['RH2M']['19920229']
                elif mutation == 'null': p['RH2M']['19910101'] = None
                elif mutation == 'nan': p['RH2M']['19910101'] = float('nan')
                elif mutation == 'sentinel': p['RH2M']['19910101'] = -999
                elif mutation == 'humidity': p['RH2M']['19910101'] = 101
                else: p['T2M_MIN']['19910101'] = p['T2M_MAX']['19910101'] + 1
                with self.assertRaises((ValueError, KeyError, TypeError)):
                    audit.validate_chunk(json.dumps(raw), 1991, 2000)

    def test_duplicate_json_key_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            audit.validate_chunk('{"header":{},"header":{}}', 1991, 2000)

    def test_reaudit_offline_is_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            for path in audit.OUTPUT.glob('*.json'):
                shutil.copyfile(path, output/path.name)
            before = (output/'audit.json').read_bytes()
            with patch.object(audit.urllib.request, 'urlopen', side_effect=AssertionError('Network forbidden')):
                with contextlib.redirect_stdout(io.StringIO()):
                    audit.main(output)
            self.assertEqual((output/'audit.json').read_bytes(), before)

    def test_redownload_cannot_replace_a_known_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            shutil.copyfile(audit.OUTPUT/'audit.json', output/'audit.json')
            changed = (audit.OUTPUT/'raw_1991_2000.json').read_bytes() + b' '
            with patch.object(audit.urllib.request, 'urlopen', return_value=io.BytesIO(changed)):
                with self.assertRaises(SystemExit):
                    audit.main(output)
            failed = json.loads((output/'audit.json').read_text())
            self.assertEqual(failed['status'], 'audit_failed')
            self.assertIn('checksum changed', failed['error'])
            self.assertFalse((output/'raw_1991_2000.json').exists())

    def test_interrupted_initial_download_retains_provenance_and_retry_pins(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            raw = (audit.OUTPUT/'raw_1991_2000.json').read_bytes()
            with patch.object(audit.urllib.request, 'urlopen', side_effect=[io.BytesIO(raw), URLError('offline')]):
                with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
                    audit.main(output)
            failed = json.loads((output/'audit.json').read_text())
            self.assertEqual(failed['status'], 'audit_failed')
            self.assertEqual(len(failed['chunks']), 1)
            first = failed['chunks'][0]
            self.assertIn('19910101', first['request_url'])
            self.assertNotIn('not inferred', first['retrieved_at_utc'])
            with (output/'raw_1991_2000.json').open('ab') as file:
                file.write(b' ')
            with self.assertRaises(SystemExit):
                audit.main(output)
            self.assertIn('checksum changed', json.loads((output/'audit.json').read_text())['error'])
            (output/'raw_1991_2000.json').write_bytes(raw)
            remaining = [(audit.OUTPUT/f'raw_{first}_{last}.json').read_bytes()
                         for first, last in ((2001, 2010), (2011, 2020))]
            with patch.object(audit.urllib.request, 'urlopen', side_effect=[io.BytesIO(p) for p in remaining]):
                with contextlib.redirect_stdout(io.StringIO()):
                    audit.main(output)
            self.assertEqual(json.loads((output/'audit.json').read_text())['chunks'][0], first)

    def test_failure_marks_manifest_failed_and_preserves_provenance(self):
        for mutation in ('checksum', 'request'):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as directory:
                output = Path(directory)
                manifest = json.loads((audit.OUTPUT/'audit.json').read_text())
                original = manifest['chunks'][0]['retrieved_at_utc']
                shutil.copyfile(audit.OUTPUT/'raw_1991_2000.json', output/'raw_1991_2000.json')
                if mutation == 'checksum':
                    with (output/'raw_1991_2000.json').open('ab') as file:
                        file.write(b' ')
                else:
                    manifest['chunks'][0]['request_url'] = 'https://example.invalid/other-site'
                (output/'audit.json').write_text(json.dumps(manifest))
                with self.assertRaises(SystemExit):
                    audit.main(output)
                failed = json.loads((output/'audit.json').read_text())
                self.assertEqual(failed['status'], 'audit_failed')
                self.assertEqual(failed['scientific_approval'], 'pending')
                self.assertEqual(failed['chunks'][0]['retrieved_at_utc'], original)


if __name__ == '__main__':
    unittest.main()
