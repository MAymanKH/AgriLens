#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv .local/mongo-venv
.local/mongo-venv/bin/python -m pip install -r requirements-mongo.txt
npm ci --prefix services/crops
npm ci --prefix services/climate
npm test --prefix services/crops
npm test --prefix services/climate
npm test --prefix services/comparison
npm test --prefix app
python3 tools/verify_fixtures.py
python3 tools/verify_runtime.py
python3 -m unittest discover -s deploy -p 'test_*.py'
.local/mongo-venv/bin/python -m unittest discover -s scripts -p 'test_backend_processes.py'
# Verify that the committed release still describes this code and these inputs.
.local/mongo-venv/bin/python scripts/prototype_release.py build
.local/mongo-venv/bin/python - <<'PY'
import json
from pathlib import Path
assert json.loads(Path('.local/backend/release.json').read_text())['manifest'] == json.loads(Path('releases/prototype.json').read_text()), 'Stale release pin; rebuild deliberately with --pin and commit it'
PY
