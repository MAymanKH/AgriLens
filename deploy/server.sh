#!/usr/bin/env bash
# Executed from the dedicated server clone, via git show for the tested commit.
set -euo pipefail
umask 077
sha=${1:?Expected the tested commit SHA}
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a full commit SHA' >&2; exit 1; }
: "${PROJECT_NAME:?Set PROJECT_NAME}"
root=$(pwd -P)
test -f "$root/.env"
for command in node npm python3 pm2 flock; do command -v "$command" >/dev/null; done
# Do not let a newly launched PM2 daemon inherit the deployment lock.
pm2() { command pm2 "$@" 9>&-; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
state="$root/.local/deploy"
mkdir -p "$state/releases"
exec 9>"$state/lock"
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
previous=''
if [[ -L "$state/current" ]]; then previous=$(readlink -f "$state/current"); fi
# A fresh directory also makes rerunning the same SHA safe while it is serving.
release=$(mktemp -d "$state/releases/$sha.XXXXXX")
git archive "$sha" | tar -x -C "$release"
cp "$root/.env" "$release/.env"
cd "$release"
python3 -m venv .local/mongo-venv
python="$release/.local/mongo-venv/bin/python"
"$python" -m pip install -r requirements-mongo.txt
npm ci --prefix services/crops
npm ci --prefix services/climate
trap '
  result=$?
  "$python" deploy/process.py diagnose "$PROJECT_NAME" || true
  exit "$result"
' ERR
"$python" scripts/prototype_release.py build
"$python" - <<'PY'
import json
from pathlib import Path
assert json.loads(Path('.local/backend/release.json').read_text())['manifest'] == json.loads(Path('releases/prototype.json').read_text()), 'Release pin differs from tested code or inputs'
PY
"$python" scripts/prototype_release.py import
# Exercise 144 comparisons on separate loopback ports before interrupting service.
HOST=127.0.0.1 COMPARISON_PORT=18000 CLIMATE_PORT=18001 CROP_PORT=18002 \
  "$python" tools/backend.py check
"$python" deploy/process.py config "$PROJECT_NAME" > "$release/.local/ecosystem.json"
rollback() {
  result=$?
  trap - ERR
  "$python" deploy/process.py diagnose "$PROJECT_NAME" || true
  echo 'Deployment failed; restoring the previous process' >&2
  if [[ -n "$previous" ]]; then
    pm2 delete "$PROJECT_NAME" || true
    pm2 start "$previous/.local/ecosystem.json"
    "$previous/.local/mongo-venv/bin/python" "$previous/deploy/process.py" ready "$PROJECT_NAME"
    pm2 save
  else
    pm2 delete "$PROJECT_NAME" || true
  fi
  exit "$result"
}
trap rollback ERR
# Delete then start so PM2 always adopts the new cwd and Python interpreter.
if pm2 describe "$PROJECT_NAME" >/dev/null 2>&1; then pm2 delete "$PROJECT_NAME"; fi
"$python" deploy/process.py ports "$PROJECT_NAME"
pm2 start "$release/.local/ecosystem.json"
"$python" deploy/process.py ready "$PROJECT_NAME"
pm2 save
ln -sfn "$release" "$state/current.next"
mv -Tf "$state/current.next" "$state/current"
trap - ERR
printf 'Deployed %s from %s\n' "$sha" "$release"
