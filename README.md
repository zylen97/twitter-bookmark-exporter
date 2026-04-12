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
