function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function asString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map(String);
  }

  return value ? [String(value)] : [];
}

function normalizeHandle(value) {
  return asString(value).replace(/^@/, '').trim();
}

function tweetIdFromUrl(url) {
  return asString(url).match(/\/status\/(\d+)/)?.[1] || '';
}

function tweetUrl(raw, author, tweetId) {
  const explicitUrl = asString(firstValue(raw.url, raw.tweetUrl, raw.tweet_url, raw.link)).trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  if (author && tweetId) {
    return `https://x.com/${author}/status/${tweetId}`;
  }

  return '';
}

export function normalizeXquikTweet(raw) {
  const user = raw.author || raw.user || raw.account || {};
  const authorValue = typeof raw.author === 'string' ? raw.author : undefined;
  const author = normalizeHandle(
    firstValue(raw.authorHandle, raw.author_handle, authorValue, raw.username, raw.screenName, raw.screen_name, user.username, user.handle)
  );
  const tweetId = asString(firstValue(raw.id, raw.tweetId, raw.tweet_id, raw.rest_id)).trim();
  const url = tweetUrl(raw, author, tweetId);

  return {
    url,
    author,
    author_name: asString(firstValue(raw.author_name, raw.authorName, raw.name, user.name)).trim(),
    created_at: asString(firstValue(raw.created_at, raw.createdAt, raw.postedAt, raw.posted_at)).trim(),
    text: asString(firstValue(raw.text, raw.full_text, raw.fullText, raw.content)).trim(),
    quoted_text: asString(firstValue(raw.quoted_text, raw.quotedText, raw.quoteText)).trim(),
    images: asArray(firstValue(raw.images, raw.imageUrls, raw.image_urls, raw.mediaUrls, raw.media_urls)),
    has_video: Boolean(firstValue(raw.has_video, raw.hasVideo, raw.videoUrl, raw.video_url)),
    links: asArray(firstValue(raw.links, raw.urls, raw.expandedUrls, raw.expanded_urls)),
    likes: asNumber(firstValue(raw.likes, raw.like_count, raw.favorite_count)),
    retweets: asNumber(firstValue(raw.retweets, raw.retweet_count)),
    replies: asNumber(firstValue(raw.replies, raw.reply_count)),
    bookmarks: asNumber(firstValue(raw.bookmarks, raw.bookmark_count)),
    lang: asString(raw.lang).trim()
  };
}

export function normalizeXquikPayload(payload) {
  const tweets = firstValue(payload.tweets, payload.data, payload.results, payload.items, payload);
  if (!Array.isArray(tweets)) {
    return [];
  }

  return tweets.map(normalizeXquikTweet).filter((tweet) => tweet.url || tweet.text);
}
