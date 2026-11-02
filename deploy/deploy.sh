#!/bin/sh
# Deploy to gtac: stamp build.json with the commit and time, copy the code over, restart the service.
#   deploy/deploy.sh            (run from anywhere)
# Leaves the server's data/ and .env alone.
set -e
cd "$(dirname "$0")/.."
HOST=${GLITCH_DEPLOY_HOST:-ubuntu@gtac}

python3 - <<'PY'
import json, subprocess, time
git = lambda *a: subprocess.run(["git", *a], capture_output=True, text=True).stdout.strip()
dirty = subprocess.run(["git", "diff", "--quiet", "HEAD"]).returncode != 0
json.dump({
    "commit": git("rev-parse", "--short", "HEAD") + ("+local" if dirty else ""),
    "message": git("log", "-1", "--format=%s"),
    "committed": int(git("log", "-1", "--format=%ct") or 0),
    "deployed": int(time.time()),
}, open("build.json", "w"))
PY

rsync -az --exclude .git --exclude data --exclude .env --exclude __pycache__ --exclude .DS_Store ./ "$HOST:apps/glitch/"
ssh "$HOST" 'sudo systemctl restart glitch && sleep 1 && systemctl is-active glitch'
echo "Deployed $(python3 -c 'import json;b=json.load(open("build.json"));print(b["commit"])')"
