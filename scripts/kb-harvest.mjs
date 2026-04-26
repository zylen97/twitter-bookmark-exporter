#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

process.env.NO_PROXY = ['127.0.0.1', 'localhost', '::1', process.env.NO_PROXY || process.env.no_proxy || '']
  .filter(Boolean)
  .join(',');
process.env.no_proxy = process.env.NO_PROXY;

const VALUES_ROOT = "/Users/zylen/Library/CloudStorage/Dropbox/Apps/Zylen's Obsidian/01-Zylen's repositories/2-Values";
const DEFAULT_RAW_INBOX = path.join(VALUES_ROOT, 'raw');
const DEFAULT_REPORT_DIR = path.join(VALUES_ROOT, '_reports', 'harvest');
const DEFAULT_STATE_DIR = path.join(VALUES_ROOT, '_automation', 'state');
const DEFAULT_RUN_DIR = path.join(VALUES_ROOT, '_automation', 'runs');
const DEFAULT_YOUTUBE_SOURCE = 'playlist:PLYYARQTSCy9fhdnPH3q_80ATpMirif9GB';
const LOCAL_TIME_ZONE = 'Asia/Shanghai';

function parseArgs(argv) {
  const out = {
    dryRun: false,
    x: true,
    youtube: true,
    youtubeSource: DEFAULT_YOUTUBE_SOURCE,
    xMaxScrolls: 12,
    xMaxResponses: 5,
    youtubeMaxScrolls: 8,
    youtubeLimit: 100,
    rawInbox: DEFAULT_RAW_INBOX,
    reportDir: DEFAULT_REPORT_DIR,
    stateDir: DEFAULT_STATE_DIR,
    runDir: DEFAULT_RUN_DIR,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--no-x') out.x = false;
    else if (arg === '--no-youtube') out.youtube = false;
    else if (arg === '--youtube-source') out.youtubeSource = next();
    else if (arg === '--x-max-scrolls') out.xMaxScrolls = Number(next());
    else if (arg === '--x-max-responses') out.xMaxResponses = Number(next());
    else if (arg === '--youtube-max-scrolls') out.youtubeMaxScrolls = Number(next());
    else if (arg === '--youtube-limit') out.youtubeLimit = Number(next());
    else if (arg === '--raw-inbox') out.rawInbox = next();
    else if (arg === '--report-dir') out.reportDir = next();
    else if (arg === '--state-dir') out.stateDir = next();
    else if (arg === '--run-dir') out.runDir = next();
    else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return out;
}

function printHelp() {
  console.log(`
KB source harvester

Usage:
  node scripts/kb-harvest.mjs [options]

Options:
  --dry-run                  Do not write raw files, reports, or state
  --no-x                     Skip Twitter/X bookmarks
  --no-youtube               Skip YouTube collection
  --youtube-source <source>  watch-later | liked | playlist:<id> | URL
                             default: ${DEFAULT_YOUTUBE_SOURCE} (KB Inbox)
  --x-max-scrolls <n>        Twitter/X scroll attempts (default: 12)
  --x-max-responses <n>      Twitter/X GraphQL pages to capture (default: 5)
  --youtube-max-scrolls <n>  YouTube scroll attempts (default: 8)
  --youtube-limit <n>        Max YouTube videos to keep (default: 100)
  --raw-inbox <path>         Raw inbox path
  --report-dir <path>        Harvest report path
  --state-dir <path>         Seen-state path
  --run-dir <path>           Run snapshot path
`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function localDateParts(d = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: LOCAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d).map(part => [part.type, part.value]));
}

function stampDate(d = new Date()) {
  const parts = localDateParts(d);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function stampDateTime(d = new Date()) {
  const parts = localDateParts(d);
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}`;
}

function sha10(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 10);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function uniquePath(file) {
  if (!fs.existsSync(file)) return file;
  const parsed = path.parse(file);
  for (let i = 2; ; i++) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${i}${parsed.ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
}

function readJsonIfExists(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadSeen(file) {
  const data = readJsonIfExists(file, []);
  if (Array.isArray(data)) return new Set(data);
  if (Array.isArray(data.seen)) return new Set(data.seen);
  if (Array.isArray(data.items)) return new Set(data.items);
  return new Set();
}

function writeSeen(file, seenSet, metadata = {}) {
  ensureDir(path.dirname(file));
  const payload = {
    ...metadata,
    updated_at: new Date().toISOString(),
    count: seenSet.size,
    seen: [...seenSet].sort(),
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function activePortFiles() {
  const home = os.homedir();
  switch (os.platform()) {
    case 'darwin':
      return [
        path.join(home, 'Library/Application Support/Google/Chrome/DevToolsActivePort'),
        path.join(home, 'Library/Application Support/Google/Chrome Canary/DevToolsActivePort'),
        path.join(home, 'Library/Application Support/Chromium/DevToolsActivePort'),
      ];
    case 'linux':
      return [
        path.join(home, '.config/google-chrome/DevToolsActivePort'),
        path.join(home, '.config/chromium/DevToolsActivePort'),
      ];
    case 'win32':
      return [
        path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/User Data/DevToolsActivePort'),
        path.join(process.env.LOCALAPPDATA || '', 'Chromium/User Data/DevToolsActivePort'),
      ];
    default:
      return [];
  }
}

function browserWebSocketFromJsonVersion(port) {
  return new Promise(resolve => {
    const req = http.get({
      host: '127.0.0.1',
      port,
      path: '/json/version',
      timeout: 2000,
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body).webSocketDebuggerUrl || null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

async function browserWebSocketCandidates(port = 9222) {
  const candidates = [];
  const add = value => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };

  add(await browserWebSocketFromJsonVersion(port));

  for (const file of activePortFiles()) {
    try {
      const [detectedPort, wsPath] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
      if (Number(detectedPort) === port && wsPath) {
        add(wsPath.startsWith('ws://') ? wsPath : `ws://127.0.0.1:${port}${wsPath}`);
      }
    } catch { /* try next method */ }
  }

  add(`ws://127.0.0.1:${port}/devtools/browser`);
  return candidates;
}

async function connectBrowser(port = 9222) {
  const errors = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const candidates = await browserWebSocketCandidates(port);
    for (const wsUrl of candidates) {
      const browser = new CDPClient(wsUrl);
      try {
        await browser.connect();
        return browser;
      } catch (error) {
        errors.push(`attempt ${attempt} ${wsUrl}: ${error.message}`);
        browser.close();
      }
    }
    await sleep(1000 * attempt);
  }
  throw new Error(`Chrome CDP connection failed. Tried ${errors.join('; ')}`);
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      const timer = setTimeout(() => reject(new Error('Chrome CDP connection timeout')), 10000);
      this.ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Chrome CDP WebSocket error'));
      });
      this.ws.addEventListener('message', event => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: done, timer: pendingTimer } = this.pending.get(msg.id);
          clearTimeout(pendingTimer);
          this.pending.delete(msg.id);
          done(msg);
        }
        if (msg.method) {
          const keys = [msg.method, msg.sessionId ? `${msg.method}:${msg.sessionId}` : null].filter(Boolean);
          for (const key of keys) {
            for (const handler of (this.handlers.get(key) || [])) handler(msg.params, msg.sessionId);
          }
        }
      });
    });
  }

  send(method, params = {}, sessionId = null, timeoutMs = 30000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(method, sessionId, handler) {
    const key = sessionId ? `${method}:${sessionId}` : method;
    if (!this.handlers.has(key)) this.handlers.set(key, []);
    this.handlers.get(key).push(handler);
  }

  close() {
    try { this.ws?.close(); } catch { /* noop */ }
  }
}

function parseTweet(result) {
  try {
    if (!result || result.__typename === 'TweetTombstone') return null;
    if (result.__typename === 'TweetWithVisibilityResults') result = result.tweet;
    if (!result) return null;

    const userResult = result?.core?.user_results?.result || {};
    const userCore = userResult.core || {};
    const userLegacy = userResult.legacy || {};
    const screenName = userCore.screen_name || userLegacy.screen_name || '';
    const displayName = userCore.name || userLegacy.name || '';
    const tweet = result.legacy || {};
    const tweetId = tweet.id_str || result.rest_id || '';
    if (!screenName || !tweetId) return null;

    const media = tweet?.extended_entities?.media || [];
    const urls = tweet?.entities?.urls || [];
    const quoted = result.quoted_status_result?.result;
    let quotedText = '';
    if (quoted && quoted.__typename !== 'TweetTombstone') {
      const quotedTweet = quoted.__typename === 'TweetWithVisibilityResults' ? quoted.tweet : quoted;
      const quotedUser = quotedTweet?.core?.user_results?.result?.core || {};
      if (quotedTweet?.legacy?.full_text) quotedText = `@${quotedUser.screen_name || '?'}: ${quotedTweet.legacy.full_text}`;
    }

    return {
      source: 'twitter_x_bookmark',
      source_url: `https://x.com/${screenName}/status/${tweetId}`,
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
      fetched_at: new Date().toISOString(),
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

  for (const inst of (timeline.instructions || [])) {
    for (const entry of (inst.entries || [])) {
      const content = entry.content || {};
      if (content.itemContent?.tweet_results?.result) {
        const tweet = parseTweet(content.itemContent.tweet_results.result);
        if (tweet) tweets.push(tweet);
      }
      for (const item of (content.items || [])) {
        const result = item?.item?.itemContent?.tweet_results?.result;
        if (result) {
          const tweet = parseTweet(result);
          if (tweet) tweets.push(tweet);
        }
      }
    }
  }
  return tweets;
}

function normXUrl(url) {
  return String(url || '').replace('https://twitter.com/', 'https://x.com/').replace(/\?.*$/, '').replace(/\/$/, '');
}

function twitterCompleteness(items) {
  return {
    total: items.length,
    url: items.filter(i => i.url).length,
    author: items.filter(i => i.author).length,
    created_at: items.filter(i => i.created_at).length,
    text_nonempty: items.filter(i => i.text && i.text.trim()).length,
    with_links: items.filter(i => i.links?.length).length,
    with_images: items.filter(i => i.images?.length).length,
    with_video_flag: items.filter(i => i.has_video).length,
  };
}

async function collectTwitterBookmarks(browser, options) {
  let targetId;
  const rawResponses = [];
  const graphqlUrls = [];
  const pending = new Map();

  const created = await browser.send('Target.createTarget', { url: 'about:blank', background: true });
  targetId = created.result.targetId;
  const attached = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = attached.result.sessionId;
  const page = (method, params = {}, timeoutMs) => browser.send(method, params, sessionId, timeoutMs);

  try {
    await page('Page.enable');
    await page('Network.enable', { maxResourceBufferSize: 20_000_000, maxTotalBufferSize: 50_000_000 });

    browser.on('Network.responseReceived', sessionId, params => {
      const url = params.response?.url || '';
      if (url.includes('/api/graphql/') && url.includes('Bookmarks') && url.includes('variables')) {
        pending.set(params.requestId, url);
        graphqlUrls.push(url);
      }
    });
    browser.on('Network.loadingFinished', sessionId, async params => {
      if (!pending.has(params.requestId)) return;
      pending.delete(params.requestId);
      try {
        const body = await page('Network.getResponseBody', { requestId: params.requestId });
        if (body.result?.body) rawResponses.push(body.result.body);
      } catch { /* response body may be evicted */ }
    });

    await page('Page.navigate', { url: 'https://x.com/i/bookmarks' });
    await sleep(7000);

    let noNewCount = 0;
    let lastCount = rawResponses.length;
    for (let i = 0; i < options.xMaxScrolls && rawResponses.length < options.xMaxResponses && noNewCount < 6; i++) {
      await page('Runtime.evaluate', { expression: 'window.scrollBy(0, 900)', returnByValue: true });
      await sleep(1400);
      if (rawResponses.length > lastCount) {
        lastCount = rawResponses.length;
        noNewCount = 0;
      } else {
        noNewCount++;
      }
    }
    await sleep(1200);

    const info = await page('Runtime.evaluate', {
      expression: 'JSON.stringify({title: document.title, url: location.href, ready: document.readyState, bodyText: document.body.innerText.slice(0, 240)})',
      returnByValue: true,
    });
    const dom = await page('Runtime.evaluate', {
      expression: `JSON.stringify([...document.querySelectorAll('article')].map((article, idx) => {
        const time = article.querySelector('time');
        const href = time?.closest('a')?.href?.split('?')[0] || '';
        return { idx, href, time: time?.dateTime || '', textLen: (article.innerText || '').length };
      }).filter(item => item.href.includes('/status/')))`,
      returnByValue: true,
    });

    const items = [];
    const seenUrls = new Set();
    let malformedResponses = 0;
    for (const raw of rawResponses) {
      try {
        const parsed = JSON.parse(raw);
        for (const tweet of extractTweets(parsed)) {
          const url = normXUrl(tweet.url);
          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            items.push({ ...tweet, url, source_url: url });
          }
        }
      } catch {
        malformedResponses++;
      }
    }

    const pageInfo = JSON.parse(info.result?.result?.value || '{}');
    const visible = JSON.parse(dom.result?.result?.value || '[]');
    const captured = new Set(items.map(i => normXUrl(i.url)));
    const visibleUrls = [...new Set(visible.map(i => normXUrl(i.href)).filter(Boolean))];
    const missingVisible = visibleUrls.filter(url => !captured.has(url));

    return {
      source: 'twitter_x_bookmarks',
      ok: rawResponses.length > 0 && items.length > 0,
      items,
      audit: {
        page: pageInfo,
        graphql_responses: rawResponses.length,
        graphql_urls: graphqlUrls.length,
        malformed_responses: malformedResponses,
        unique_items: items.length,
        completeness: twitterCompleteness(items),
        visible_canonical_urls: visibleUrls.length,
        visible_missing_from_graphql: missingVisible.length,
        visible_missing_hashes: missingVisible.slice(0, 10).map(sha10),
        sample_hashes: items.slice(0, 10).map(i => sha10(i.url)),
      },
    };
  } finally {
    await browser.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

function youtubeSourceToUrl(source) {
  if (!source || source === 'watch-later') {
    return { label: 'youtube_watch_later', url: 'https://www.youtube.com/playlist?list=WL' };
  }
  if (source === 'liked') {
    return { label: 'youtube_liked', url: 'https://www.youtube.com/playlist?list=LL' };
  }
  if (source.startsWith('playlist:')) {
    const id = source.slice('playlist:'.length);
    return { label: `youtube_playlist_${id}`, url: `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}` };
  }
  if (/^https?:\/\//.test(source)) {
    return { label: 'youtube_custom_playlist', url: source };
  }
  throw new Error(`Unsupported YouTube source: ${source}`);
}

function sanitizeLabel(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'source';
}

function extractVideoId(url) {
  try {
    return new URL(url).searchParams.get('v') || '';
  } catch {
    return '';
  }
}

function youtubeCompleteness(items) {
  return {
    total: items.length,
    video_id: items.filter(i => i.video_id).length,
    url: items.filter(i => i.url).length,
    title_nonempty: items.filter(i => i.title && i.title.trim()).length,
    channel_nonempty: items.filter(i => i.channel && i.channel.trim()).length,
  };
}

async function collectYouTube(browser, options) {
  const source = youtubeSourceToUrl(options.youtubeSource);
  let targetId;
  const created = await browser.send('Target.createTarget', { url: source.url, background: true });
  targetId = created.result.targetId;
  const attached = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = attached.result.sessionId;
  const page = (method, params = {}, timeoutMs) => browser.send(method, params, sessionId, timeoutMs);

  const extractor = `JSON.stringify({
    title: document.title,
    url: location.href,
    ready: document.readyState,
    loginHint: /Sign in|登录|ログイン/.test(document.body.innerText),
    emptyHint: /No videos|没有视频|動画はありません|This playlist does not exist/.test(document.body.innerText),
    videos: [...document.querySelectorAll('ytd-playlist-video-renderer, ytd-video-renderer')].map((renderer, idx) => {
      const link = renderer.querySelector('a#video-title') || renderer.querySelector('a[href*="watch?v="]:not(#thumbnail)');
      const rawHref = link?.href || '';
      const title = (link?.textContent || link?.getAttribute('title') || '').trim().replace(/\\s+/g, ' ');
      const channel = (renderer.querySelector('ytd-channel-name a, a.yt-simple-endpoint.yt-formatted-string')?.textContent || '').trim().replace(/\\s+/g, ' ');
      const duration = (renderer.querySelector('ytd-thumbnail-overlay-time-status-renderer span, span.ytd-thumbnail-overlay-time-status-renderer')?.textContent || '').trim().replace(/\\s+/g, ' ');
      return { idx, href: rawHref.split('&')[0], title, channel, duration };
    }).filter(video => video.href.includes('watch?v='))
  })`;

  try {
    await page('Page.enable');
    await sleep(9000);

    let lastCount = 0;
    let noNewCount = 0;
    for (let i = 0; i < options.youtubeMaxScrolls && noNewCount < 4; i++) {
      const current = await page('Runtime.evaluate', { expression: extractor, returnByValue: true });
      const parsed = JSON.parse(current.result?.result?.value || '{}');
      const count = new Set((parsed.videos || []).map(v => v.href)).size;
      if (count >= options.youtubeLimit) break;
      if (count > lastCount) {
        lastCount = count;
        noNewCount = 0;
      } else {
        noNewCount++;
      }
      await page('Runtime.evaluate', { expression: 'window.scrollBy(0, 1800)', returnByValue: true });
      await sleep(1200);
    }

    const final = await page('Runtime.evaluate', { expression: extractor, returnByValue: true });
    const pageInfo = JSON.parse(final.result?.result?.value || '{}');
    const seen = new Set();
    const items = [];
    for (const video of (pageInfo.videos || [])) {
      const url = video.href.split('&')[0];
      const videoId = extractVideoId(url);
      if (!videoId || seen.has(videoId)) continue;
      seen.add(videoId);
      items.push({
        source: source.label,
        source_url: url,
        url,
        video_id: videoId,
        title: video.title,
        channel: video.channel,
        duration: video.duration,
        position: video.idx,
        added_at: null,
        fetched_at: new Date().toISOString(),
        transcript_status: 'not_fetched',
        cleanup_recommendation: source.label === 'youtube_watch_later' ? 'review_before_manual_removal' : 'none',
      });
      if (items.length >= options.youtubeLimit) break;
    }

    return {
      source: source.label,
      ok: items.length > 0,
      items,
      audit: {
        page: {
          title: pageInfo.title,
          url: pageInfo.url,
          ready: pageInfo.ready,
          login_hint: Boolean(pageInfo.loginHint),
          empty_hint: Boolean(pageInfo.emptyHint),
        },
        unique_items: items.length,
        completeness: youtubeCompleteness(items),
        sample_hashes: items.slice(0, 10).map(i => sha10(i.url)),
        warning: source.label === 'youtube_watch_later'
          ? 'Browser fallback only. Official YouTube API cannot list Watch Later.'
          : null,
      },
    };
  } finally {
    await browser.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

function applyIncremental(sourceResult, stateFile, keyFn) {
  const seen = loadSeen(stateFile);
  const newItems = [];
  const duplicateItems = [];
  for (const item of sourceResult.items) {
    const key = keyFn(item);
    if (!key) continue;
    if (seen.has(key)) duplicateItems.push(item);
    else newItems.push(item);
  }
  return { seen, newItems, duplicateItems };
}

function writeRawBatch(rawInbox, dateTime, label, items, audit) {
  if (!items.length) return null;
  ensureDir(rawInbox);
  const file = uniquePath(path.join(rawInbox, `${dateTime}_${sanitizeLabel(label)}-new.json`));
  const payload = {
    source: label,
    fetched_at: new Date().toISOString(),
    count: items.length,
    audit,
    items,
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return file;
}

function writeRunSnapshot(runDir, dateTime, label, result) {
  ensureDir(runDir);
  const file = uniquePath(path.join(runDir, `${dateTime}_${sanitizeLabel(label)}-snapshot.json`));
  fs.writeFileSync(file, `${JSON.stringify({
    source: result.source,
    fetched_at: new Date().toISOString(),
    count: result.items.length,
    audit: result.audit,
    items: result.items,
  }, null, 2)}\n`, 'utf8');
  return file;
}

function renderReport({ date, dryRun, outputs, twitter, youtube }) {
  const lines = [];
  lines.push(`# KB Source Harvest Report - ${date}`);
  lines.push('');
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- Mode: ${dryRun ? 'dry-run, no files/state written' : 'write raw inbox + update state'}`);
  lines.push('');

  for (const entry of [twitter, youtube].filter(Boolean)) {
    const { result, newItems, duplicateItems } = entry;
    lines.push(`## ${result.source}`);
    lines.push('');
    lines.push(`- OK: ${result.ok ? 'yes' : 'no'}`);
    lines.push(`- Captured unique items: ${result.items.length}`);
    lines.push(`- New items: ${newItems.length}`);
    lines.push(`- Already seen: ${duplicateItems.length}`);
    lines.push(`- Sample URL hashes: ${(result.audit.sample_hashes || []).join(', ') || 'none'}`);
    lines.push('');
    lines.push('### Audit');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(result.audit, null, 2));
    lines.push('```');
    lines.push('');

    if (result.source === 'youtube_watch_later' && newItems.length) {
      lines.push('### Watch Later Cleanup Candidates');
      lines.push('');
      lines.push('These are candidates only. The harvester does not remove videos automatically.');
      lines.push('');
      for (const item of newItems.slice(0, 30)) {
        lines.push(`- [ ] ${item.title || item.video_id} (${item.video_id})`);
      }
      lines.push('');
    }
  }

  lines.push('## Outputs');
  lines.push('');
  if (outputs.length) {
    for (const output of outputs) lines.push(`- ${output}`);
  } else {
    lines.push('- none');
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const date = stampDate();
  const dateTime = stampDateTime();
  const browser = await connectBrowser(9222);

  const outputs = [];
  let twitter = null;
  let youtube = null;

  try {
    if (options.x) {
      const result = await collectTwitterBookmarks(browser, options);
      const stateFile = path.join(options.stateDir, 'twitter_x_seen_urls.json');
      const delta = applyIncremental(result, stateFile, item => normXUrl(item.url));
      twitter = { result, ...delta };
      if (!options.dryRun) {
        outputs.push(writeRunSnapshot(options.runDir, dateTime, result.source, result));
        const raw = writeRawBatch(options.rawInbox, dateTime, result.source, delta.newItems, result.audit);
        if (raw) outputs.push(raw);
        for (const item of result.items) delta.seen.add(normXUrl(item.url));
        writeSeen(stateFile, delta.seen, { source: result.source });
        outputs.push(stateFile);
      }
    }

    if (options.youtube) {
      const result = await collectYouTube(browser, options);
      const stateFile = path.join(options.stateDir, `${sanitizeLabel(result.source)}_seen_video_ids.json`);
      const delta = applyIncremental(result, stateFile, item => item.video_id);
      youtube = { result, ...delta };
      if (!options.dryRun) {
        outputs.push(writeRunSnapshot(options.runDir, dateTime, result.source, result));
        const raw = writeRawBatch(options.rawInbox, dateTime, result.source, delta.newItems, result.audit);
        if (raw) outputs.push(raw);
        for (const item of result.items) delta.seen.add(item.video_id);
        writeSeen(stateFile, delta.seen, { source: result.source });
        outputs.push(stateFile);
      }
    }

    const report = renderReport({ date, dryRun: options.dryRun, outputs, twitter, youtube });
    if (options.dryRun) {
      console.log(report);
    } else {
      ensureDir(options.reportDir);
      const reportFile = path.join(options.reportDir, `${date}_kb-source-harvest.md`);
      fs.writeFileSync(reportFile, report, 'utf8');
      outputs.push(reportFile);
      console.log(JSON.stringify({ ok: true, outputs }, null, 2));
    }
  } finally {
    browser.close();
  }
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
