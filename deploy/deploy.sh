#!/bin/sh
# Deploy a branch to gtac: build the Vue app, stamp build.json with the commit and time, copy the code
# and the built app over, restart the service.
#   deploy/deploy.sh michael    -> https://glitch.dunc.app    (~/apps/glitch,      glitch.service,      port 8090)
#   deploy/deploy.sh finn       -> https://code.gtac.edu.au   (~/apps/glitch-finn, glitch-finn.service, port 8091)
# Ships what is committed on that branch (git archive), so local scratch files never go out.
# The Vue app is built here (needs Node and npm), so the server only needs Python.
# Leaves the server's data/ and .env alone.
set -e
cd "$(dirname "$0")/.."
HOST=${GLITCH_DEPLOY_HOST:-ubuntu@gtac}
BRANCH=${1:?usage: deploy/deploy.sh michael|finn}
case "$BRANCH" in
  michael) DIR=apps/glitch;      SVC=glitch;      URL=https://glitch.dunc.app ;;
  finn)    DIR=apps/glitch-finn; SVC=glitch-finn; URL=https://code.gtac.edu.au ;;
  *) echo "unknown branch: $BRANCH" >&2; exit 1 ;;
esac

git rev-parse --verify -q "$BRANCH" >/dev/null || { echo "no local branch $BRANCH" >&2; exit 1; }
SHA=$(git rev-parse --short "$BRANCH")
MSG=$(git log -1 --format=%s "$BRANCH" | tr -d '"\')

# Build the web app from that same commit, in a scratch folder, so what ships matches the code
# (not whatever is in the working tree). Done before touching the server, so a failed build
# leaves the live site as it was.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git archive "$BRANCH" web | tar -xf - -C "$TMP"
echo "Building the web app from $SHA..."
(cd "$TMP/web" && npm ci --no-audit --no-fund --loglevel=error && npm run build)
[ -f "$TMP/web/dist/index.html" ] || { echo "build made no web/dist/index.html" >&2; exit 1; }

printf '{"commit": "%s", "message": "%s", "committed": %s, "deployed": %s}' \
  "$SHA" "$MSG" "$(git log -1 --format=%ct "$BRANCH")" "$(date +%s)" > build.json

git archive "$BRANCH" | ssh "$HOST" "tar -xf - -C ~/$DIR"
# dist/ isn't committed, so it goes separately. It's unpacked beside the old one and swapped in
# whole, so files from older builds don't pile up.
tar -cf - -C "$TMP/web" dist | ssh "$HOST" "cd ~/$DIR/web && rm -rf dist.new && mkdir dist.new \
  && tar -xf - -C dist.new --strip-components=1 && rm -rf dist && mv dist.new dist"
scp -q build.json "$HOST:$DIR/build.json"
ssh "$HOST" "sudo systemctl restart $SVC && sleep 1 && systemctl is-active $SVC"
echo "Deployed $SHA ($BRANCH) to $URL"
