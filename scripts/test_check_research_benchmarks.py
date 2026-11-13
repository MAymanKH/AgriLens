"""Regression checks for PR #1 input-validation review.

Run: python -m unittest discover -s scripts -p test_check_research_benchmarks.py
"""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from check_research_benchmarks import REQUIRED_VARIABLES, validate_raw

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/check_research_benchmarks.py'


class RawInputTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = json.loads((ROOT / 'data/raw/nasa_power_zankalon_2016_2025.json').read_text())

    def reject(self, raw, message):
        with self.assertRaisesRegex(ValueError, message):
            validate_raw(raw)
        # Check the real entrypoint as well: corruption must never print success.
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'raw.json'
            path.write_text(json.dumps(raw))
            result = subprocess.run([sys.executable, str(SCRIPT), '--raw', str(path)],
                                    capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('INPUT ERROR:', result.stderr)
        self.assertNotIn('arithmetic checks passed', result.stdout)

    def test_retained_response_is_complete(self):
        _, dates = validate_raw(self.raw)
        self.assertEqual(len(dates), 3653)

    def test_each_required_variable_is_required(self):
        for variable in REQUIRED_VARIABLES:
            with self.subTest(variable=variable):
                raw = copy.deepcopy(self.raw)
                del raw['properties']['parameter'][variable]
                self.reject(raw, variable + ': missing variable')

    def test_null_nonfinite_nonnumeric_and_sentinel_rejected(self):
        for value in (None, float('nan'), float('inf'), -float('inf'), True, '65', -999):
            with self.subTest(value=value):
                raw = copy.deepcopy(self.raw)
                raw['properties']['parameter']['RH2M']['20160101'] = value
                self.reject(raw, 'RH2M 20160101:')

    def test_each_variable_requires_all_dates(self):
        for variable in REQUIRED_VARIABLES:
            with self.subTest(variable=variable):
                raw = copy.deepcopy(self.raw)
                del raw['properties']['parameter'][variable]['20200229']
                self.reject(raw, variable + ': incomplete')

    def test_unexpected_dates_rejected(self):
        raw = copy.deepcopy(self.raw)
        raw['properties']['parameter']['RH2M']['20260101'] = 60
        self.reject(raw, 'RH2M: incomplete or unexpected')


if __name__ == '__main__':
    unittest.main()
