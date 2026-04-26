#!/bin/zsh
set -euo pipefail

export HOME="/Users/zylen"
export PATH="/Users/zylen/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export NO_PROXY="127.0.0.1,localhost,::1,${NO_PROXY:-}"
export no_proxy="$NO_PROXY"

REPO_DIR="/Users/zylen/Library/CloudStorage/Dropbox/04-Coding/twitter-bookmark-exporter"
LOG_DIR="$REPO_DIR/logs"
CHROME_BIN="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
CHROME_USER_DATA_DIR="${CHROME_USER_DATA_DIR:-$HOME/Library/Application Support/Google/Chrome KB Automation}"
CHROME_REMOTE_DEBUGGING_PORT="${CHROME_REMOTE_DEBUGGING_PORT:-9222}"
CHROME_LOG="$LOG_DIR/chrome-kb-automation.log"

mkdir -p "$LOG_DIR"
cd "$REPO_DIR"

NPM_BIN="$(command -v npm || true)"
if [[ -z "$NPM_BIN" ]]; then
  echo "npm not found in PATH=$PATH" >&2
  exit 127
fi

chrome_cdp_ready() {
  curl --noproxy '*' -fsS --max-time 2 \
    "http://127.0.0.1:$CHROME_REMOTE_DEBUGGING_PORT/json/version" >/dev/null 2>&1
}

if ! chrome_cdp_ready; then
  mkdir -p "$CHROME_USER_DATA_DIR"
  echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Starting Chrome CDP profile at $CHROME_USER_DATA_DIR"
  "$CHROME_BIN" \
    --user-data-dir="$CHROME_USER_DATA_DIR" \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port="$CHROME_REMOTE_DEBUGGING_PORT" \
    --no-first-run \
    --no-default-browser-check \
    about:blank >> "$CHROME_LOG" 2>&1 &

  for _ in {1..30}; do
    if chrome_cdp_ready; then
      break
    fi
    sleep 1
  done
fi

if ! chrome_cdp_ready; then
  echo "Chrome CDP was not ready on port $CHROME_REMOTE_DEBUGGING_PORT. See $CHROME_LOG" >&2
  exit 70
fi

echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] KB harvest launchd run started"
"$NPM_BIN" run kb:harvest -- --chrome-port "$CHROME_REMOTE_DEBUGGING_PORT" --cleanup-youtube-after-write "$@"
echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] KB harvest launchd run finished"
