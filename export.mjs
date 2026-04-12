#!/usr/bin/env node
/**
 * Twitter/X Bookmark Exporter
 *
 * Exports all your bookmarks from Twitter/X by intercepting the internal
 * GraphQL API via Chrome DevTools Protocol (CDP). No API keys needed.
 *
 * Prerequisites:
 *   - Node.js 22+ (uses native WebSocket)
 *   - Chrome with remote debugging enabled
 *
 * Usage:
 *   node export.mjs [options]
 *
 * Options:
 *   -o, --output <file>   Output file path (default: bookmarks.jsonl)
 *   -f, --format <fmt>    Output format: jsonl, json, csv, md (default: jsonl)
 *   -p, --port <port>     Chrome CDP port (default: 9222)
 *   --raw                 Also save raw API responses to ./raw/
 *   -h, --help            Show help
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function flag(name, short) {
  const i = args.findIndex(a => a === `--${name}` || a === `-${short}`);
  if (i === -1) return undefined;
  return args[i + 1];
}

function hasFlag(name, short) {
  return args.some(a => a === `--${name}` || (short && a === `-${short}`));
}

if (hasFlag('help', 'h')) {
  console.log(`
Twitter/X Bookmark Exporter

Exports all your bookmarks by intercepting Twitter's internal GraphQL API
via Chrome DevTools Protocol. Zero dependencies, no API keys needed.

Prerequisites:
  1. Node.js 22+ (uses native WebSocket)
  2. Open Chrome, go to chrome://flags, search "remote debugging",
     enable it, and restart Chrome.
     Or launch Chrome with: --remote-debugging-port=9222

Usage:
  node export.mjs [options]

Options:
  -o, --output <file>   Output file path (default: bookmarks.jsonl)
  -f, --format <fmt>    Output format: jsonl, json, csv, md (default: jsonl)
  -p, --port <port>     Chrome CDP port (default: 9222)
  --raw                 Also save raw API responses to ./raw/
  -h, --help            Show help

Examples:
  node export.mjs                          # Export to bookmarks.jsonl
  node export.mjs -f json -o my-bm.json    # Export as JSON array
  node export.mjs -f md                    # Export as Markdown
  node export.mjs -f csv                   # Export as CSV
  node export.mjs --raw                    # Also save raw API responses
`);
  process.exit(0);
}

const CDP_PORT = parseInt(flag('port', 'p') || '9222', 10);
const FORMAT = flag('format', 'f') || 'jsonl';
const SAVE_RAW = hasFlag('raw');

const defaultNames = { jsonl: 'bookmarks.jsonl', json: 'bookmarks.json', csv: 'bookmarks.csv', md: 'bookmarks.md' };
const OUTPUT = flag('output', 'o') || defaultNames[FORMAT] || 'bookmarks.jsonl';

if (!['jsonl', 'json', 'csv', 'md'].includes(FORMAT)) {
  console.error(`Unknown format: ${FORMAT}. Use: jsonl, json, csv, md`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CDP Client
// ---------------------------------------------------------------------------

const WS = globalThis.WebSocket;
if (!WS) {
  console.error('Native WebSocket not available. Node.js 22+ is required.');
  process.exit(1);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this._id = 0;
    this._callbacks = new Map();
    this._handlers = {};
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WS(this.wsUrl);
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
      this.ws.addEventListener('open', () => { clearTimeout(timeout); resolve(); });
      this.ws.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WebSocket connection failed')); });
      this.ws.addEventListener('close', () => { /* noop */ });
      this.ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id !== undefined) {
          const cb = this._callbacks.get(msg.id);
          if (cb) { this._callbacks.delete(msg.id); cb(msg); }
        }
        if (msg.method && msg.params) {
          const sessionId = msg.sessionId || null;
          const key = sessionId ? `${msg.method}:${sessionId}` : msg.method;
          for (const k of [key, msg.method]) {
            for (const h of (this._handlers[k] || [])) h(msg.params);
          }
        }
      });
    });
  }

  send(method, params = {}, sessionId = null) {
    const id = ++this._id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._callbacks.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 30000);
      this._callbacks.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(event, handler, sessionId = null) {
    const key = sessionId ? `${event}:${sessionId}` : event;
    if (!this._handlers[key]) this._handlers[key] = [];
    this._handlers[key].push(handler);
  }

  close() { if (this.ws) this.ws.close(); }
}

// ---------------------------------------------------------------------------
// Tweet Parser
// ---------------------------------------------------------------------------

function parseTweet(result) {
  try {
    if (!result || result.__typename === 'TweetTombstone') return null;
    if (result.__typename === 'TweetWithVisibilityResults') result = result.tweet;
    if (!result) return null;

    const userResult = result?.core?.user_results?.result || {};
    // Twitter 2025+: screen_name moved from legacy to core
    const userCore = userResult.core || {};
    const userLegacy = userResult.legacy || {};
    const screenName = userCore.screen_name || userLegacy.screen_name || '';
    const displayName = userCore.name || userLegacy.name || '';

    const tweet = result.legacy || {};
    const tweetId = tweet.id_str || result.rest_id || '';

    if (!screenName || !tweetId) return null;

    const media = tweet?.extended_entities?.media || [];
    const urls = tweet?.entities?.urls || [];

    // Parse quoted tweet
    let quotedText = '';
    const quoted = result.quoted_status_result?.result;
    if (quoted && quoted.__typename !== 'TweetTombstone') {
      const qr = quoted.__typename === 'TweetWithVisibilityResults' ? quoted.tweet : quoted;
      if (qr?.legacy?.full_text) {
        const qUser = qr?.core?.user_results?.result?.core || {};
        quotedText = `@${qUser.screen_name || '?'}: ${qr.legacy.full_text}`;
      }
    }

    return {
      url: `https://x.com/${screenName}/status/${tweetId}`,
      author: screenName,
      author_name: displayName,
      created_at: tweet.created_at || '',
      text: tweet.full_text || '',
      quoted_text: quotedText,
      images: media.filter(m => m.type === 'photo').map(m => m.media_url_https),
      has_video: media.some(m => m.type === 'video' || m.type === 'animated_gif'),
      links: urls.map(u => u.expanded_url).filter(Boolean),
      likes: tweet.favorite_count || 0,
      retweets: tweet.retweet_count || 0,
      replies: tweet.reply_count || 0,
      bookmarks: tweet.bookmark_count || 0,
      lang: tweet.lang || '',
    };
  } catch {
    return null;
  }
}

function extractTweets(apiResponse) {
  const tweets = [];
  const timeline =
    apiResponse?.data?.bookmark_timeline_v2?.timeline ||
    apiResponse?.data?.bookmark_timeline?.timeline ||
    {};
  const instructions = timeline.instructions || [];

  for (const inst of instructions) {
    for (const entry of (inst.entries || [])) {
      const content = entry.content || {};

      // Direct tweet entry
      if (content.itemContent?.tweet_results?.result) {
        const t = parseTweet(content.itemContent.tweet_results.result);
        if (t) tweets.push(t);
      }

      // Conversation thread items
      for (const item of (content.items || [])) {
        const ic = item?.item?.itemContent;
        if (ic?.tweet_results?.result) {
          const t = parseTweet(ic.tweet_results.result);
          if (t) tweets.push(t);
        }
      }
    }
  }

  return tweets;
}

// ---------------------------------------------------------------------------
// Output Formatters
// ---------------------------------------------------------------------------

function writeOutput(tweets, filepath, format) {
  let content;

  switch (format) {
    case 'json':
      content = JSON.stringify(tweets, null, 2);
      break;

    case 'jsonl':
      content = tweets.map(t => JSON.stringify(t)).join('\n') + '\n';
      break;

    case 'csv': {
      const escape = (s) => `"${String(s || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
      const header = 'url,author,author_name,created_at,text,likes,retweets,replies,has_video,images,links';
      const rows = tweets.map(t =>
        [t.url, t.author, t.author_name, t.created_at, t.text, t.likes, t.retweets,
         t.replies, t.has_video, (t.images || []).join(' '), (t.links || []).join(' ')]
          .map(escape).join(',')
      );
      content = [header, ...rows].join('\n') + '\n';
      break;
    }

    case 'md': {
      const lines = [`# Twitter/X Bookmarks\n`, `Exported: ${new Date().toISOString()}  `, `Total: ${tweets.length} bookmarks\n`, '---\n'];
      for (const t of tweets) {
        lines.push(`### [@${t.author}](https://x.com/${t.author}) — ${t.created_at || 'unknown date'}\n`);
        lines.push(t.text + '\n');
        if (t.quoted_text) lines.push(`> ${t.quoted_text}\n`);
        if (t.images?.length) {
          for (const img of t.images) lines.push(`![](${img})\n`);
        }
        lines.push(`[Link](${t.url}) | ${t.likes} likes | ${t.retweets} RTs\n`);
        lines.push('---\n');
      }
      content = lines.join('\n');
      break;
    }
  }

  fs.writeFileSync(filepath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Connect to Chrome
  console.log(`Connecting to Chrome CDP on port ${CDP_PORT}...`);
  const browser = new CDPClient(`ws://127.0.0.1:${CDP_PORT}/devtools/browser`);
  try {
    await browser.connect();
  } catch {
    console.error(
      '\nFailed to connect to Chrome DevTools.\n\n' +
      'Make sure Chrome is running with remote debugging enabled:\n' +
      '  Option A: chrome://flags → search "remote debugging" → Enable → Restart\n' +
      '  Option B: Launch Chrome with --remote-debugging-port=9222\n'
    );
    process.exit(1);
  }
  console.log('Connected!\n');

  // 2. Create a new background tab
  const { result: { targetId } } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params = {}) => browser.send(method, params, sessionId);

  // 3. Enable Network monitoring
  await page('Network.enable', { maxResourceBufferSize: 10_000_000 });
  await page('Page.enable');

  // 4. Set up network interception for Bookmarks API
  const rawResponses = [];
  const pendingRequests = new Map();

  browser.on('Network.responseReceived', (params) => {
    const url = params.response?.url || '';
    if (url.includes('/api/graphql/') && url.includes('Bookmarks') && url.includes('variables')) {
      pendingRequests.set(params.requestId, url);
    }
  }, sessionId);

  browser.on('Network.loadingFinished', async (params) => {
    const url = pendingRequests.get(params.requestId);
    if (!url) return;
    pendingRequests.delete(params.requestId);
    try {
      const { result } = await page('Network.getResponseBody', { requestId: params.requestId });
      if (result?.body) {
        rawResponses.push(result.body);
        process.stdout.write(`\r  Fetched page ${rawResponses.length}...`);
      }
    } catch { /* response body may have been evicted */ }
  }, sessionId);

  // 5. Navigate to bookmarks page
  console.log('Opening bookmarks page...');
  await page('Page.navigate', { url: 'https://x.com/i/bookmarks' });
  await sleep(5000);

  if (rawResponses.length === 0) {
    // Check if we're logged in
    const { result } = await page('Runtime.evaluate', { expression: 'document.title' });
    if (result?.result?.value?.includes('Login') || result?.result?.value?.includes('ログイン')) {
      console.error('\nNot logged in to Twitter/X. Please log in to Chrome first.');
      await browser.send('Target.closeTarget', { targetId });
      browser.close();
      process.exit(1);
    }
  }

  // 6. Scroll to trigger pagination
  console.log('Scrolling to load all bookmarks...');
  let noNewCount = 0;
  let lastCount = rawResponses.length;
  const MAX_PATIENCE = 15;

  for (let i = 0; i < 500 && noNewCount < MAX_PATIENCE; i++) {
    await page('Runtime.evaluate', { expression: 'window.scrollBy(0, 800)' });
    await sleep(1200);

    if (rawResponses.length > lastCount) {
      lastCount = rawResponses.length;
      noNewCount = 0;
    } else {
      noNewCount++;
    }
  }

  console.log(`\n  API pages captured: ${rawResponses.length}`);

  // 7. Save raw responses if requested
  if (SAVE_RAW && rawResponses.length > 0) {
    const rawDir = path.join(path.dirname(OUTPUT), 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    for (let i = 0; i < rawResponses.length; i++) {
      fs.writeFileSync(path.join(rawDir, `page_${i + 1}.json`), rawResponses[i], 'utf-8');
    }
    console.log(`  Raw responses saved to ${rawDir}/`);
  }

  // 8. Parse all responses
  console.log('Parsing tweets...');
  const allTweets = [];
  const seenUrls = new Set();

  for (const raw of rawResponses) {
    try {
      const data = JSON.parse(raw);
      const tweets = extractTweets(data);
      for (const t of tweets) {
        if (!seenUrls.has(t.url)) {
          seenUrls.add(t.url);
          allTweets.push(t);
        }
      }
    } catch { /* skip malformed responses */ }
  }

  // 9. Write output
  if (allTweets.length === 0) {
    console.log('\nNo bookmarks found. Your bookmark list might be empty.');
  } else {
    writeOutput(allTweets, OUTPUT, FORMAT);

    // Stats
    const authors = {};
    for (const t of allTweets) authors[t.author] = (authors[t.author] || 0) + 1;
    const topAuthors = Object.entries(authors).sort((a, b) => b[1] - a[1]).slice(0, 10);

    console.log(`\n${'='.repeat(50)}`);
    console.log(`  Bookmarks exported: ${allTweets.length}`);
    console.log(`  Unique authors:     ${Object.keys(authors).length}`);
    console.log(`  Output file:        ${OUTPUT}`);
    console.log(`  Format:             ${FORMAT}`);
    console.log(`${'='.repeat(50)}`);
    console.log(`\n  Top authors:`);
    for (const [name, count] of topAuthors) {
      console.log(`    @${name}: ${count}`);
    }
  }

  // 10. Cleanup
  await browser.send('Target.closeTarget', { targetId });
  browser.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
