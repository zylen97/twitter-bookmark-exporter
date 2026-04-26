# Twitter/X Bookmark Exporter

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen)](#)

Export **all** your Twitter/X bookmarks to JSON, CSV, or Markdown. No API keys, no browser extensions, no rate limits — just one command.

## How It Works

Unlike tools that scrape the DOM or require Twitter API keys, this tool works at the **network layer**:

1. Connects to your Chrome browser via [Chrome DevTools Protocol (CDP)](https://chromedevtools.github.io/devtools-protocol/)
2. Opens your bookmarks page in a background tab
3. Intercepts Twitter's internal GraphQL API responses (`Bookmarks` endpoint)
4. Scrolls automatically to trigger pagination
5. Parses the raw API data — the same data Twitter's own frontend uses

This approach is fundamentally more reliable than DOM scraping because:
- **No virtual scrolling issues** — API responses contain complete data regardless of what's rendered
- **Full metadata** — likes, retweets, replies, media URLs, quoted tweets, and more
- **Can't be blocked by UI changes** — works as long as Twitter's GraphQL API exists

## Features

- **Zero dependencies** — only uses Node.js built-in modules (native WebSocket from Node 22+)
- **No API keys needed** — piggybacks on your existing browser login session
- **No bookmark limit** — exports everything, not capped at 800 like the official API
- **Multiple output formats** — JSONL, JSON, CSV, Markdown
- **Full tweet metadata** — text, author, timestamps, likes, retweets, images, videos, quoted tweets, external links
- **Raw data option** — save original API responses for custom processing
- **Privacy-first** — runs 100% locally, no data sent to any third party

## Prerequisites

- **Node.js 22+** (uses native WebSocket, no npm install needed)
- **Google Chrome** with remote debugging enabled

### Enable Chrome Remote Debugging

**Option A — Chrome flags (recommended, persistent):**

1. Open Chrome, go to `chrome://flags`
2. Search for **"remote debugging"**
3. Set to **Enabled**
4. Restart Chrome

**Option B — Launch from terminal (one-time):**

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222

# Windows
chrome.exe --remote-debugging-port=9222
```

> **Important:** You must be logged in to Twitter/X in Chrome before running the exporter.

## Usage

```bash
# Clone the repo
git clone https://github.com/zylen97/twitter-bookmark-exporter.git
cd twitter-bookmark-exporter

# Run with default settings (exports to bookmarks.jsonl)
node export.mjs

# Export as JSON array
node export.mjs -f json

# Export as Markdown (great for reading/archiving)
node export.mjs -f md -o my-bookmarks.md

# Export as CSV (for spreadsheets)
node export.mjs -f csv

# Also save raw API responses for debugging/custom processing
node export.mjs --raw

# Use a different CDP port
node export.mjs -p 9333
```

## KB Nightly Harvest

This repository also includes a local KB harvester for Zylen's Obsidian Values
vault. It collects recent Twitter/X bookmarks and a YouTube source, writes only
new items to the KB raw inbox, stores seen-state for incremental runs, and emits
an audit report.

```bash
# Audit only; opens Chrome pages but writes nothing
npm run kb:harvest:dry-run

# Write new raw items, run snapshots, state, and report to the Values vault
npm run kb:harvest

# Default YouTube source is the private KB Inbox playlist
npm run kb:harvest -- --youtube-source playlist:PLYYARQTSCy9fhdnPH3q_80ATpMirif9GB

# Use YouTube Watch Later through browser fallback
npm run kb:harvest -- --youtube-source watch-later

# Use liked videos through browser fallback
npm run kb:harvest -- --youtube-source liked

# Use a normal playlist id
npm run kb:harvest -- --youtube-source playlist:PLxxxxxxxx

# After a successful write, remove captured videos from a normal playlist source
npm run kb:harvest -- --cleanup-youtube-after-write
```

Default output paths:

```text
2-Values/raw/                       # timestamped new-item JSON batches
2-Values/_automation/state/
2-Values/_automation/runs/
2-Values/_reports/harvest/
```

Raw new-item batches include a timestamp in the filename, so manual reruns on
the same day do not overwrite earlier inbox files.

With `--cleanup-youtube-after-write`, the harvester removes captured videos from
normal YouTube playlist sources after the run snapshot, raw batch, and seen-state
have been written successfully. Cleanup writes a per-run JSON audit file and a
summary in the harvest report. It does **not** remove videos from Watch Later or
Liked Videos.

The recommended long-term YouTube intake path is the private `KB Inbox`
playlist (`PLYYARQTSCy9fhdnPH3q_80ATpMirif9GB`). Save videos there when they
should enter the KB source pipeline.

For reliable CDP access, close any other tool currently attached to Chrome's
remote debugging port before running the harvester. The script also forces
`NO_PROXY=127.0.0.1,localhost,::1` internally so local Chrome debugging does
not accidentally route through a system HTTP proxy.

### macOS launchd schedule

The durable daily schedule should be owned by macOS `launchd`, not by Codex
cron, because this harvester needs Chrome/CDP and live access to X/YouTube.

```bash
mkdir -p logs
cp config/launchd/com.zylen.kb-harvest.plist ~/Library/LaunchAgents/
launchctl bootout "gui/$(id -u)" ~/Library/LaunchAgents/com.zylen.kb-harvest.plist 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.zylen.kb-harvest.plist
launchctl enable "gui/$(id -u)/com.zylen.kb-harvest"
```

The installed job runs every day at 21:00 and writes launchd stdout/stderr to:

```text
logs/launchd-kb-harvest-stdout.log
logs/launchd-kb-harvest-stderr.log
```

Codex Automation should only read the generated harvest report afterward. It
should not run the harvester directly.

The launchd wrapper enables `--cleanup-youtube-after-write`, so videos saved to
the private `KB Inbox` playlist are removed from that playlist after they have
been captured. Twitter/X bookmarks are never removed by this repository.

Chrome 136+ requires a non-default profile for remote debugging. The launchd
wrapper therefore starts a dedicated profile at:

```text
~/Library/Application Support/Google/Chrome KB Automation
```

Sign in to X and YouTube once in that profile before relying on the nightly job.
Its Chrome startup log is written to:

```text
logs/chrome-kb-automation.log
```

To open the automation profile for first-time sign-in:

```bash
open -na "Google Chrome" --args \
  --user-data-dir="$HOME/Library/Application Support/Google/Chrome KB Automation" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --no-first-run \
  --no-default-browser-check \
  "https://www.youtube.com/playlist?list=PLYYARQTSCy9fhdnPH3q_80ATpMirif9GB" \
  "https://x.com/i/bookmarks"
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <file>` | Output file path | `bookmarks.{format}` |
| `-f, --format <fmt>` | Output format: `jsonl`, `json`, `csv`, `md` | `jsonl` |
| `-p, --port <port>` | Chrome CDP port | `9222` |
| `--raw` | Also save raw API responses to `./raw/` | off |
| `-h, --help` | Show help | — |

## Output Format

### JSONL (default)

One JSON object per line. Each bookmark contains:

```json
{
  "url": "https://x.com/username/status/123456",
  "author": "username",
  "author_name": "Display Name",
  "created_at": "Wed Apr 09 12:34:56 +0000 2026",
  "text": "Full tweet text...",
  "quoted_text": "@other_user: quoted tweet text...",
  "images": ["https://pbs.twimg.com/media/..."],
  "has_video": false,
  "links": ["https://example.com/article"],
  "likes": 42,
  "retweets": 7,
  "replies": 3,
  "bookmarks": 5,
  "lang": "en"
}
```

### Markdown

Renders each bookmark as a readable card with author, text, media links, and engagement stats. Great for archiving to Obsidian or other note-taking apps.

### CSV

Flat format compatible with Excel, Google Sheets, or any data analysis tool.

## Limitations

- **Chrome only** — requires Chrome/Chromium with CDP support (Edge should also work)
- **Must be logged in** — uses your existing browser session to access bookmarks
- **Not automated** — requires Chrome to be running with debugging enabled
- **Twitter may change its API** — GraphQL response structure updates may require parser updates
- **Memory** — very large bookmark collections (10,000+) may require more system memory

## How It Compares

| Feature | This tool | Twitter API | UserScript tools | Browser extensions |
|---------|-----------|-------------|------------------|--------------------|
| API key required | No | Yes | No | No |
| Bookmark limit | None | 800 | None | Varies |
| Dependencies | None | SDK + auth | Tampermonkey | Extension install |
| Reliability | Network-layer | Official | DOM-dependent | DOM-dependent |
| Output formats | 4 | Raw JSON | JSON/CSV | JSON/CSV |
| Media metadata | Full | Full | Partial | Partial |
| Works headless | Possible | Yes | No | No |

## Troubleshooting

### "Failed to connect to Chrome DevTools"

Chrome isn't accepting CDP connections. Make sure:
1. Chrome is running
2. Remote debugging is enabled (see [Prerequisites](#enable-chrome-remote-debugging))
3. No other tool is occupying the CDP port

### "Not logged in to Twitter/X"

The exporter opens a background tab — it uses your existing Chrome login session. Log in to Twitter/X in Chrome first.

### Fewer bookmarks than expected

- Some bookmarks may reference deleted tweets (tombstones) — these are automatically skipped
- Twitter may have pruned old bookmarks
- Check with `--raw` to see the actual API responses

### Empty output

If Chrome has multiple profiles, make sure the profile with your Twitter login is the one that has remote debugging enabled.

## Privacy & Security

- **100% local** — no data leaves your machine
- **Read-only** — only reads bookmarks, never modifies your account
- **No credentials stored** — authentication is handled entirely by your Chrome browser
- **Open source** — audit the code yourself, it's a single file

## License

[MIT](LICENSE) — use it however you want.

## Acknowledgments

Built with [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/). Inspired by the need to reliably export personal Twitter data without depending on fragile DOM scraping or restricted API access.
