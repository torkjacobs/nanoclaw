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
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import { onSocialMention } from './tork-swarm.js';

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

/**
 * Relevance keywords — a post must match at least ONE of these to trigger
 * an alert. Generic terms like "AI", "agent", "security" alone are too broad.
 */
const RELEVANCE_KEYWORDS: RegExp[] = [
  /\btork\b/i,
  /\btork[\s.-]?network\b/i,
  /\btork\.network\b/i,
  /\b@torknetwork\b/i,
  /\bai\s+governance\b/i,
  /\bai\s+agent\s+governance\b/i,
  /\bagent\s+governance\b/i,
  /\bmcp\s+security\b/i,
  /\bmcp\s+governance\b/i,
  /\bpii\s+detection\b/i,
  /\bpii\s+redaction\b/i,
  /\bcompliance\s+receipts?\b/i,
  /\btorking\b/i,
  /\bopenclaw\s+security\b/i,
  /\bclawhub\s+security\b/i,
  /\blakera\b/i,
  /\bmintmcp\b/i,
  /\bguardrails\s+ai\b/i,
  /\bprompt\s+armor\b/i,
  /\brebuff\b/i,
];

function isRelevantMention(title: string, body?: string): boolean {
  const text = body ? `${title} ${body}` : title;
  return RELEVANCE_KEYWORDS.some((re) => re.test(text));
}

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
  story_text?: string;
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
    selftext?: string;
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

      if (!isRelevantMention(hit.title || '', hit.story_text)) continue;

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

    if (!isRelevantMention(post.title || '', post.selftext)) continue;

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

  // Swarm: auto-draft engagement for the first new mention
  const first = newMentions[0];
  onSocialMention(first.source, first.title, first.url).catch((err) =>
    logger.error({ err }, 'Swarm onSocialMention failed'),
  );

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

// ══════════════════════════════════════════════════════════════
//  INFLUENCER MONITORING
// ══════════════════════════════════════════════════════════════

const INFLUENCER_ACCOUNTS = [
  // AI newsletters & media
  'rowancheung', // The Rundown AI (2M+ subs)
  'zaaborham', // Superhuman AI
  'bensbites', // Ben's Bites
  // AI/tech leaders
  'emaborjmah', // Emad Mostaque
  'sama', // Sam Altman
  'AndrewYNg', // Andrew Ng
  // Exponentialists & macro
  'davidmattin', // David Mattin (New World Same Humans, exponential age)
  'RasoulPal', // Raoul Pal (Real Vision, macro + AI convergence)
  'PeterDiamandis', // Peter Diamandis (XPRIZE, abundance, exponential tech)
  'AzizonomicsBA', // Azeem Azhar (Exponential View newsletter)
  'SalimIsmail', // Salim Ismail (ExO Works — Zunaid connection)
  // AI governance & safety
  'ylecun', // Yann LeCun (Meta AI chief)
  'GaryMarcus', // Gary Marcus (AI safety critic)
];

const INFLUENCER_KEYWORDS =
  /\b(agent|governance|pii|compliance|security|autonomous|mcp|regulation|audit|trust|safety|responsible|ethical ai|ai risk|ai policy|exponential|disruption|singularity)\b/i;

const INFLUENCER_SEEN_FILE = path.join(
  process.cwd(),
  'store',
  'influencer-seen.json',
);

const NITTER_HOSTS = ['https://nitter.net', 'https://twiiit.com'];

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

interface InfluencerSeenStore {
  seen: Record<string, number>; // tweet url -> unix timestamp
}

function loadInfluencerSeen(): InfluencerSeenStore {
  try {
    const data = fs.readFileSync(INFLUENCER_SEEN_FILE, 'utf-8');
    return JSON.parse(data) as InfluencerSeenStore;
  } catch {
    return { seen: {} };
  }
}

function saveInfluencerSeen(store: InfluencerSeenStore): void {
  fs.mkdirSync(path.dirname(INFLUENCER_SEEN_FILE), { recursive: true });
  fs.writeFileSync(INFLUENCER_SEEN_FILE, JSON.stringify(store, null, 2));
}

function pruneInfluencerSeen(store: InfluencerSeenStore): void {
  const cutoff = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  for (const [url, ts] of Object.entries(store.seen)) {
    if (ts < cutoff) delete store.seen[url];
  }
}

interface RssItem {
  title: string;
  link: string;
  pubDate: number; // unix seconds
}

async function fetchInfluencerRss(handle: string): Promise<RssItem[]> {
  for (const host of NITTER_HOSTS) {
    try {
      const url = `${host}/${handle}/rss`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'TorkBot/1.0' },
      });
      clearTimeout(timer);

      if (!response.ok) continue;

      const xml = await response.text();
      return parseRssItems(xml);
    } catch {
      continue;
    }
  }
  return [];
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const titleMatch =
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
      block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

    if (!titleMatch || !linkMatch) continue;

    const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    const link = linkMatch[1].trim();
    const pubDate = dateMatch
      ? Math.floor(new Date(dateMatch[1].trim()).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    items.push({ title, link, pubDate });
  }

  return items;
}

async function generateReplyDraft(tweetText: string): Promise<string | null> {
  const env = readEnvFile(['ANTHROPIC_API_KEY']);
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 256,
        system:
          'You are Yusuf Jacobs, CEO of Tork Network. Write a brief, genuine reply to this tweet. Add real value or insight about AI governance. Do NOT mention Tork or your product. Just be helpful and knowledgeable. Keep it under 200 characters. No hashtags.',
        messages: [{ role: 'user', content: tweetText }],
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const textBlock = data.content.find((b) => b.type === 'text');
    return textBlock?.text?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function checkInfluencers(): Promise<string[]> {
  const store = loadInfluencerSeen();
  pruneInfluencerSeen(store);

  const fourHoursAgo = Math.floor(Date.now() / 1000) - 4 * 60 * 60;
  const alerts: string[] = [];

  for (const handle of INFLUENCER_ACCOUNTS) {
    try {
      const items = await fetchInfluencerRss(handle);

      for (const item of items) {
        if (item.pubDate < fourHoursAgo) continue;
        if (store.seen[item.link]) continue;
        if (!INFLUENCER_KEYWORDS.test(item.title)) continue;

        store.seen[item.link] = item.pubDate;

        const replyDraft = await generateReplyDraft(item.title);

        const lines = [
          `\uD83C\uDFAF Influencer Alert \u2014 @${handle}`,
          '',
          item.title,
          `\uD83D\uDD17 ${item.link}`,
        ];

        if (replyDraft) {
          lines.push('', 'Suggested reply (edit before posting):', replyDraft);
        }

        alerts.push(lines.join('\n'));
      }
    } catch (err) {
      logger.warn({ err, handle }, 'Failed to check influencer feed');
    }
  }

  saveInfluencerSeen(store);

  logger.info(
    { alertCount: alerts.length, handles: INFLUENCER_ACCOUNTS },
    'Influencer check completed',
  );

  return alerts;
}

// ══════════════════════════════════════════════════════════════
//  TIMER
// ══════════════════════════════════════════════════════════════

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

    // Influencer check on the same cycle
    try {
      const alerts = await checkInfluencers();
      for (const alert of alerts) {
        await sendMessage(alert);
      }
    } catch (err) {
      logger.error({ err }, 'Influencer check failed');
    }
  };

  // First check 90 seconds after startup
  setTimeout(runCheck, 90_000);

  return setInterval(runCheck, CHECK_INTERVAL_MS);
}
