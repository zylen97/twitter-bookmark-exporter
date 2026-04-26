#!/bin/zsh
set -euo pipefail

export HOME="/Users/zylen"
export PATH="/Users/zylen/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export NO_PROXY="127.0.0.1,localhost,::1,${NO_PROXY:-}"
export no_proxy="$NO_PROXY"

REPO_DIR="/Users/zylen/Library/CloudStorage/Dropbox/04-Coding/twitter-bookmark-exporter"
LOG_DIR="$REPO_DIR/logs"

mkdir -p "$LOG_DIR"
cd "$REPO_DIR"

NPM_BIN="$(command -v npm || true)"
if [[ -z "$NPM_BIN" ]]; then
  echo "npm not found in PATH=$PATH" >&2
  exit 127
fi

echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] KB harvest launchd run started"
"$NPM_BIN" run kb:harvest -- "$@"
echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] KB harvest launchd run finished"
