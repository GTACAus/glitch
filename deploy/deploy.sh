#!/bin/sh
# Deploy a branch to gtac: stamp build.json with the commit and time, copy the code over, restart the service.
#   deploy/deploy.sh michael    -> https://glitch.dunc.app    (~/apps/glitch,      glitch.service,      port 8090)
#   deploy/deploy.sh finn       -> https://code.gtac.edu.au   (~/apps/glitch-finn, glitch-finn.service, port 8091)
# Ships what is committed on that branch (git archive), so local scratch files never go out.
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
printf '{"commit": "%s", "message": "%s", "committed": %s, "deployed": %s}' \
  "$SHA" "$MSG" "$(git log -1 --format=%ct "$BRANCH")" "$(date +%s)" > build.json

# Code folders are replaced outright so removed files don't linger; data/ and .env are never touched.
git archive "$BRANCH" | ssh "$HOST" "cd ~/$DIR && rm -rf static library starters && tar -xf -"
scp -q build.json "$HOST:$DIR/build.json"
ssh "$HOST" "sudo systemctl restart $SVC && sleep 1 && systemctl is-active $SVC"
echo "Deployed $SHA ($BRANCH) to $URL"
