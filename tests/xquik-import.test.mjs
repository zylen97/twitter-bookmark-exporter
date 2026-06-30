import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeXquikPayload, normalizeXquikTweet } from '../lib/xquik-import.mjs';

test('normalizes Xquik search records to exporter tweet shape', () => {
  assert.deepEqual(
    normalizeXquikTweet({
      tweet_id: '123',
      username: '@alice',
      author_name: 'Alice',
      created_at: '2026-06-30T05:00:00.000Z',
      full_text: 'Bookmark text',
      media_urls: ['https://pbs.twimg.com/media/one.jpg'],
      urls: ['https://example.com'],
      favorite_count: '4',
      retweet_count: 2,
      reply_count: '1',
      bookmark_count: 7,
      lang: 'en'
    }),
    {
      url: 'https://x.com/alice/status/123',
      author: 'alice',
      author_name: 'Alice',
      created_at: '2026-06-30T05:00:00.000Z',
      text: 'Bookmark text',
      quoted_text: '',
      images: ['https://pbs.twimg.com/media/one.jpg'],
      has_video: false,
      links: ['https://example.com'],
      likes: 4,
      retweets: 2,
      replies: 1,
      bookmarks: 7,
      lang: 'en'
    }
  );
});

test('accepts wrapped Xquik payload arrays', () => {
  assert.deepEqual(
    normalizeXquikPayload({
      data: [
        { url: 'https://x.com/bob/status/456', user: { username: 'bob', name: 'Bob' }, text: 'Saved' },
        {}
      ]
    }),
    [
      {
        url: 'https://x.com/bob/status/456',
        author: 'bob',
        author_name: 'Bob',
        created_at: '',
        text: 'Saved',
        quoted_text: '',
        images: [],
        has_video: false,
        links: [],
        likes: 0,
        retweets: 0,
        replies: 0,
        bookmarks: 0,
        lang: ''
      }
    ]
  );
});
