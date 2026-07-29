/**
 * Tork SEO Tracker (Skill 11)
 *
 * Google Search Console integration for weekly SEO reports.
 * On-demand via "@tork seo" / "@tork gsc".
 * Weekly report every Monday 9:00 AM AEST.
 */
import fs from 'fs';
import path from 'path';

import { TIMEZONE } from './config.js';
import { readEnvFile, updateEnvVar } from './env.js';
import { logger } from './logger.js';

const SEO_PATTERN = /^@tork\s+(seo|gsc)\s*$/i;
const REQUEST_TIMEOUT_MS = 15_000;
const SITE_URL = 'sc-domain:tork.network';

// ══════════════════════════════════════════════════════════════
//  ENV & AUTH
// ══════════════════════════════════════════════════════════════

function getGscCredentials() {
  return readEnvFile([
    'GSC_CLIENT_ID',
    'GSC_CLIENT_SECRET',
    'GSC_ACCESS_TOKEN',
    'GSC_REFRESH_TOKEN',
  ]);
}

async function refreshAccessToken(): Promise<string | null> {
  const creds = getGscCredentials();
  if (
    !creds.GSC_CLIENT_ID ||
    !creds.GSC_CLIENT_SECRET ||
    !creds.GSC_REFRESH_TOKEN
  ) {
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.GSC_CLIENT_ID,
        client_secret: creds.GSC_CLIENT_SECRET,
        refresh_token: creds.GSC_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, body },
        'GSC token refresh failed',
      );
      return null;
    }

    const data = (await response.json()) as { access_token: string };
    const newToken = data.access_token;

    // Persist new token to .env
    updateEnvVar('GSC_ACCESS_TOKEN', newToken);
    logger.info('GSC access token refreshed');
    return newToken;
  } catch (err) {
    logger.error({ err }, 'GSC token refresh error');
    return null;
  }
}

async function gscFetch(
  url: string,
  options: RequestInit = {},
): Promise<unknown | null> {
  const creds = getGscCredentials();
  let token: string | undefined = creds.GSC_ACCESS_TOKEN;

  if (!token) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) return null;
    token = refreshed;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const doFetch = async (accessToken: string) => {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    return response;
  };

  try {
    let response = await doFetch(token);

    // Token expired — refresh and retry once
    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      if (!newToken) {
        clearTimeout(timer);
        return null;
      }
      response = await doFetch(newToken);
    }

    clearTimeout(timer);
    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body, url }, 'GSC API error');
      return null;
    }
    return await response.json();
  } catch (err) {
    clearTimeout(timer);
    logger.error({ err, url }, 'GSC fetch error');
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
//  GSC QUERIES
// ══════════════════════════════════════════════════════════════

interface SearchRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SearchResponse {
  rows?: SearchRow[];
  responseAggregationType?: string;
}

interface SitemapEntry {
  path: string;
  lastSubmitted?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  lastDownloaded?: string;
  warnings?: string;
  errors?: string;
  contents?: Array<{ type: string; submitted: string; indexed: string }>;
}

interface SitemapsResponse {
  sitemap?: SitemapEntry[];
}

function formatDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

async function querySearchPerformance(
  startDaysAgo: number,
  endDaysAgo: number,
  rowLimit = 10,
): Promise<{
  rows: SearchRow[];
  totals: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  };
} | null> {
  const encodedSite = encodeURIComponent(SITE_URL);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`;

  const data = (await gscFetch(url, {
    method: 'POST',
    body: JSON.stringify({
      startDate: formatDate(startDaysAgo),
      endDate: formatDate(endDaysAgo),
      dimensions: ['query'],
      rowLimit,
    }),
  })) as SearchResponse | null;

  if (!data) return null;

  const rows = data.rows || [];
  const totals = rows.reduce(
    (acc, r) => ({
      clicks: acc.clicks + r.clicks,
      impressions: acc.impressions + r.impressions,
      ctr: 0,
      position: 0,
    }),
    { clicks: 0, impressions: 0, ctr: 0, position: 0 },
  );

  if (rows.length > 0) {
    totals.ctr = totals.clicks / totals.impressions;
    totals.position =
      rows.reduce((sum, r) => sum + r.position * r.impressions, 0) /
      totals.impressions;
  }

  return { rows, totals };
}

async function getSitemapStatus(): Promise<string> {
  const encodedSite = encodeURIComponent(SITE_URL);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps`;

  const data = (await gscFetch(url)) as SitemapsResponse | null;

  if (!data?.sitemap || data.sitemap.length === 0) {
    return 'No sitemaps found';
  }

  return data.sitemap
    .map((s) => {
      const name = s.path.replace(/^https?:\/\/[^/]+/, '');
      const status = s.isPending ? 'Pending' : 'OK';
      const submitted = s.lastSubmitted
        ? new Date(s.lastSubmitted).toLocaleDateString('en-AU', {
            timeZone: TIMEZONE,
          })
        : 'unknown';
      return `${name} \u2014 ${status} (submitted ${submitted})`;
    })
    .join('\n');
}

// ══════════════════════════════════════════════════════════════
//  REPORT FORMATTING
// ══════════════════════════════════════════════════════════════

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function delta(current: number, previous: number): string {
  const diff = current - previous;
  const sign = diff >= 0 ? '+' : '';
  const pctChange =
    previous > 0 ? ` (${sign}${((diff / previous) * 100).toFixed(0)}%)` : '';
  return `${sign}${diff}${pctChange}`;
}

async function buildSeoReport(): Promise<string> {
  const creds = getGscCredentials();
  if (!creds.GSC_ACCESS_TOKEN && !creds.GSC_REFRESH_TOKEN) {
    return [
      '\u{1F4CA} Tork SEO Report',
      '',
      'GSC not configured. Run: node scripts/gsc-oauth.js',
      'Then restart NanoClaw.',
    ].join('\n');
  }

  const [thisWeek, lastWeek, sitemapStatus] = await Promise.all([
    querySearchPerformance(7, 1),
    querySearchPerformance(14, 8),
    getSitemapStatus(),
  ]);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: TIMEZONE,
  });

  if (!thisWeek) {
    return [
      `\u{1F4CA} Tork SEO Report \u2014 Week of ${dateStr}`,
      '',
      'Could not fetch GSC data. Token may have expired.',
      'Run: node scripts/gsc-oauth.js to re-authorize.',
    ].join('\n');
  }

  const lines: string[] = [
    `\u{1F4CA} Tork SEO Report \u2014 Week of ${dateStr}`,
    '\u2501'.repeat(25),
    '',
  ];

  // Top queries
  lines.push('\u{1F50D} Top Queries (7 days)');
  if (thisWeek.rows.length === 0) {
    lines.push('No query data yet.');
  } else {
    for (let i = 0; i < thisWeek.rows.length; i++) {
      const r = thisWeek.rows[i];
      const query = r.keys[0] || '(unknown)';
      lines.push(
        `${i + 1}. ${query} \u2014 ${r.clicks} clicks, pos ${r.position.toFixed(1)}`,
      );
    }
  }

  // Totals
  lines.push('', '\u{1F4C8} Totals (7 days)');
  lines.push(`Clicks: ${thisWeek.totals.clicks}`);
  lines.push(`Impressions: ${thisWeek.totals.impressions}`);
  lines.push(`Avg CTR: ${pct(thisWeek.totals.ctr)}`);
  lines.push(`Avg Position: ${thisWeek.totals.position.toFixed(1)}`);

  // Comparison
  if (lastWeek) {
    lines.push('', '\u{1F4CA} vs Previous Week');
    lines.push(
      `Clicks: ${delta(thisWeek.totals.clicks, lastWeek.totals.clicks)}`,
    );
    lines.push(
      `Impressions: ${delta(thisWeek.totals.impressions, lastWeek.totals.impressions)}`,
    );
  }

  // Sitemap
  lines.push('', '\u{1F5FA}\uFE0F Sitemap Status');
  lines.push(sitemapStatus);

  lines.push('', '\u2501'.repeat(25));
  lines.push('Use @tork seo anytime for on-demand report.');

  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════════════════════

export function isSeoRequest(content: string): boolean {
  return SEO_PATTERN.test(content.trim());
}

export async function handleSeoCommand(): Promise<string> {
  logger.info('Running on-demand SEO report');
  return buildSeoReport();
}

// ══════════════════════════════════════════════════════════════
//  WEEKLY TIMER — Monday 9:00 AM AEST
// ══════════════════════════════════════════════════════════════

function msUntilNextMonday9AM(): number {
  const TZ = 'Australia/Sydney';
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);
  const weekday = parts.find((p) => p.type === 'weekday')!.value;

  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const currentDay = dayMap[weekday] ?? 0;
  const currentMs = (hour * 3600 + minute * 60 + second) * 1000;
  const targetMs = 9 * 3600 * 1000; // 9:00 AM
  const dayMs = 24 * 60 * 60 * 1000;

  // Check today through next 7 days for Mon (1)
  for (let offset = 0; offset < 8; offset++) {
    const day = (currentDay + offset) % 7;
    if (day !== 1) continue;
    const delay = offset * dayMs + (targetMs - currentMs);
    if (delay > 0) return delay;
  }

  // Fallback
  const daysUntilMon = (1 - currentDay + 7) % 7 || 7;
  return daysUntilMon * dayMs + (targetMs - currentMs);
}

export function startWeeklySeoTimer(
  sendMessage: (text: string) => Promise<void>,
): void {
  const scheduleNext = () => {
    const delay = msUntilNextMonday9AM();
    const hours = Math.floor(delay / 3600000);
    const mins = Math.floor((delay % 3600000) / 60000);
    logger.info({ delayMs: delay, hours, mins }, 'Next SEO report scheduled');

    setTimeout(async () => {
      try {
        const report = await buildSeoReport();
        await sendMessage(report);
      } catch (err) {
        logger.error({ err }, 'Weekly SEO report failed');
      }
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}
