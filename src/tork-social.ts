/**
 * Tork Social Listener
 *
 * Monitors Hacker News and Reddit for mentions of Tork Network every
 * 4 hours. Stores seen URLs to avoid duplicate alerts. Posts to the
 * main group only when new mentions are found.
 * On-demand via "@tork mentions" / "@tork social".
 */
import fs from 'fs';
import path from 'path';

import { TIMEZONE } from './config.js';
import { logger } from './logger.js';

interface Mention {
  title: string;
  url: string;
  author: string;
  timestamp: number; // unix seconds
  source: 'HN' | 'Reddit';
  subreddit?: string;
}

interface MentionStore {
  seen: Record<string, number>; // url -> unix timestamp first seen
}

const STORE_FILE = path.join(process.cwd(), 'store', 'social-mentions.json');
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const REQUEST_TIMEOUT_MS = 15_000;
const LOOKBACK_SECONDS = 12 * 60 * 60; // 12 hours for scheduled checks
const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours for on-demand

const SOCIAL_PATTERN = /^@tork\s+(mentions|social)\s*$/i;

export function isSocialListenerRequest(content: string): boolean {
  return SOCIAL_PATTERN.test(content.trim());
}

function loadStore(): MentionStore {
  try {
    const data = fs.readFileSync(STORE_FILE, 'utf-8');
    return JSON.parse(data) as MentionStore;
  } catch {
    return { seen: {} };
  }
}

function saveStore(store: MentionStore): void {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function pruneOldEntries(store: MentionStore): void {
  const cutoff = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60; // 7 days
  for (const [url, ts] of Object.entries(store.seen)) {
    if (ts < cutoff) delete store.seen[url];
  }
}

function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

async function fetchJson(
  url: string,
  headers?: Record<string, string>,
): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'TorkBot/1.0',
        ...headers,
      },
    });

    clearTimeout(timer);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

interface HNHit {
  title?: string;
  url?: string;
  story_url?: string;
  objectID?: string;
  author?: string;
  created_at_i?: number;
}

interface HNResponse {
  hits?: HNHit[];
}

interface RedditChild {
  data?: {
    title?: string;
    url?: string;
    permalink?: string;
    author?: string;
    created_utc?: number;
    subreddit?: string;
  };
}

interface RedditResponse {
  data?: {
    children?: RedditChild[];
  };
}

async function searchHackerNews(sinceUnix: number): Promise<Mention[]> {
  const queries = ['tork+network+ai', 'tork+governance+ai'];
  const mentions: Mention[] = [];
  const seenIds = new Set<string>();

  for (const query of queries) {
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${query}&tags=story&numericFilters=created_at_i>${sinceUnix}`;
    const data = (await fetchJson(url)) as HNResponse | null;
    if (!data?.hits) continue;

    for (const hit of data.hits) {
      const id = hit.objectID || hit.url || hit.title;
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);

      const linkUrl =
        hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;

      mentions.push({
        title: hit.title || '(untitled)',
        url: linkUrl,
        author: hit.author || 'unknown',
        timestamp: hit.created_at_i || Math.floor(Date.now() / 1000),
        source: 'HN',
      });
    }
  }

  return mentions;
}

async function searchReddit(sinceUnix: number): Promise<Mention[]> {
  const url =
    'https://www.reddit.com/search.json?q=tork+network+ai+governance&sort=new&t=day&limit=10';
  const data = (await fetchJson(url)) as RedditResponse | null;
  if (!data?.data?.children) return [];

  const mentions: Mention[] = [];

  for (const child of data.data.children) {
    const post = child.data;
    if (!post) continue;

    const createdUtc = post.created_utc || 0;
    if (createdUtc < sinceUnix) continue;

    const postUrl = post.url || `https://reddit.com${post.permalink || ''}`;

    mentions.push({
      title: post.title || '(untitled)',
      url: postUrl,
      author: post.author || 'unknown',
      timestamp: Math.floor(createdUtc),
      source: 'Reddit',
      subreddit: post.subreddit,
    });
  }

  return mentions;
}

export async function checkSocialMentions(): Promise<{
  newMentions: Mention[];
  allRecent: Mention[];
}> {
  const store = loadStore();
  pruneOldEntries(store);

  const sinceUnix = Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS;

  const [hnMentions, redditMentions] = await Promise.all([
    searchHackerNews(sinceUnix),
    searchReddit(sinceUnix),
  ]);

  const allMentions = [...hnMentions, ...redditMentions];
  const newMentions: Mention[] = [];

  for (const mention of allMentions) {
    if (!store.seen[mention.url]) {
      newMentions.push(mention);
      store.seen[mention.url] = mention.timestamp;
    }
  }

  // Collect all recent (last 48h) for on-demand queries
  const recentCutoff = Math.floor(Date.now() / 1000) - RECENT_WINDOW_MS / 1000;
  const allRecent = Object.entries(store.seen)
    .filter(([, ts]) => ts >= recentCutoff)
    .map(([url, ts]) => {
      const existing = allMentions.find((m) => m.url === url);
      return (
        existing || {
          title: url,
          url,
          author: 'unknown',
          timestamp: ts,
          source: 'HN' as const,
        }
      );
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  saveStore(store);
  return { newMentions, allRecent };
}

export async function runSocialCheck(): Promise<string | null> {
  const { newMentions } = await checkSocialMentions();

  logger.info(
    { newCount: newMentions.length },
    'Social mention check completed',
  );

  if (newMentions.length === 0) return null;

  const hnMentions = newMentions.filter((m) => m.source === 'HN');
  const redditMentions = newMentions.filter((m) => m.source === 'Reddit');

  const lines: string[] = [
    `\u{1F4E1} Tork Social Mentions \u2014 ${newMentions.length} new`,
  ];

  if (hnMentions.length > 0) {
    lines.push('', '\u{1F7E0} Hacker News:');
    for (const m of hnMentions) {
      lines.push(
        `\u2022 ${m.title} \u2014 by ${m.author} (${timeAgo(m.timestamp)})`,
      );
      lines.push(`  ${m.url}`);
    }
  }

  if (redditMentions.length > 0) {
    lines.push('', '\u{1F535} Reddit:');
    for (const m of redditMentions) {
      const sub = m.subreddit ? `r/${m.subreddit}` : 'Reddit';
      lines.push(`\u2022 ${m.title} \u2014 ${sub} (${timeAgo(m.timestamp)})`);
      lines.push(`  ${m.url}`);
    }
  }

  return lines.join('\n');
}

export async function getSocialStatus(): Promise<string> {
  const { allRecent } = await checkSocialMentions();

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE,
  });
  const tzLabel = now
    .toLocaleTimeString('en-AU', {
      timeZoneName: 'short',
      timeZone: TIMEZONE,
    })
    .split(' ')
    .pop();

  if (allRecent.length === 0) {
    return [
      '\u{1F4E1} Tork Social Mentions \u2014 Last 48h',
      '',
      'No mentions found in the last 48 hours.',
      '',
      `${timeStr} ${tzLabel}`,
    ].join('\n');
  }

  const hnMentions = allRecent.filter((m) => m.source === 'HN');
  const redditMentions = allRecent.filter((m) => m.source === 'Reddit');

  const lines: string[] = [
    `\u{1F4E1} Tork Social Mentions \u2014 Last 48h (${allRecent.length} total)`,
  ];

  if (hnMentions.length > 0) {
    lines.push('', '\u{1F7E0} Hacker News:');
    for (const m of hnMentions) {
      lines.push(
        `\u2022 ${m.title} \u2014 by ${m.author} (${timeAgo(m.timestamp)})`,
      );
      lines.push(`  ${m.url}`);
    }
  }

  if (redditMentions.length > 0) {
    lines.push('', '\u{1F535} Reddit:');
    for (const m of redditMentions) {
      const sub = m.subreddit ? `r/${m.subreddit}` : 'Reddit';
      lines.push(`\u2022 ${m.title} \u2014 ${sub} (${timeAgo(m.timestamp)})`);
      lines.push(`  ${m.url}`);
    }
  }

  lines.push('', `${timeStr} ${tzLabel}`);
  return lines.join('\n');
}

export function startSocialListenerTimer(
  sendMessage: (text: string) => Promise<void>,
): ReturnType<typeof setInterval> {
  const runCheck = async () => {
    try {
      const result = await runSocialCheck();
      if (result) await sendMessage(result);
    } catch (err) {
      logger.error({ err }, 'Tork social mention check failed');
    }
  };

  // First check 90 seconds after startup
  setTimeout(runCheck, 90_000);

  return setInterval(runCheck, CHECK_INTERVAL_MS);
}
