/**
 * Tork Analytics Reporter (Skill 9)
 *
 * Queries Supabase directly via REST API for user, API key, and
 * book download metrics. Sends a daily report at 8:10 AM AEST and
 * responds on-demand to "@tork metrics/stats/analytics".
 */
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import { onAnalyticsReport } from './tork-swarm.js';

const ANALYTICS_PATTERN = /^@tork\s+(metrics|stats|analytics)\s*$/i;
const REQUEST_TIMEOUT_MS = 10_000;
const REPORT_HOUR = 8;
const REPORT_MINUTE = 10; // 8:10 AM
const REPORT_TZ = 'Australia/Sydney';

export function isAnalyticsRequest(content: string): boolean {
  return ANALYTICS_PATTERN.test(content.trim());
}

function getSupabaseConfig(): { url: string; key: string } | null {
  const env = readEnvFile(['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']);
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY;
  if (!url || !key || key === 'MISSING') return null;
  return { url, key };
}

/**
 * Query a Supabase table using the Prefer: count=exact technique.
 * Returns the total count from the content-range header, or 'N/A' on failure.
 */
async function queryCount(
  baseUrl: string,
  apiKey: string,
  table: string,
  filter?: string,
): Promise<number | 'N/A'> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let url = `${baseUrl}/rest/v1/${table}?select=id&limit=1`;
    if (filter) url += `&${filter}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Prefer: 'count=exact',
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) return 'N/A';

    const contentRange = response.headers.get('content-range');
    if (!contentRange) return 'N/A';

    // Format: "0-0/42" or "*/0"
    const match = contentRange.match(/\/(\d+)$/);
    return match ? parseInt(match[1], 10) : 'N/A';
  } catch {
    return 'N/A';
  }
}

function todayStartISO(): string {
  const now = new Date();
  const aest = new Date(now.toLocaleString('en-US', { timeZone: REPORT_TZ }));
  aest.setHours(0, 0, 0, 0);
  // Convert back to UTC ISO string
  const offset = now.getTime() - aest.getTime();
  const utcMidnight = new Date(
    now.getTime() - (now.getTime() - aest.getTime()) + offset,
  );
  // Simpler approach: format in AEST then build ISO
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return `${formatter.format(now)}T00:00:00+11:00`;
}

function weekStartISO(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = formatter.format(now);
  const localDate = new Date(todayStr + 'T00:00:00+11:00');
  const dayOfWeek = localDate.getUTCDay(); // 0=Sun
  const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday start
  const monday = new Date(localDate.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return monday.toISOString().split('T')[0] + 'T00:00:00+11:00';
}

function formatNum(val: number | 'N/A'): string {
  return val === 'N/A' ? 'N/A' : val.toLocaleString();
}

interface Metrics {
  totalUsers: number | 'N/A';
  newToday: number | 'N/A';
  newWeek: number | 'N/A';
  totalKeys: number | 'N/A';
  activeKeys: number | 'N/A';
  totalDownloads: number | 'N/A';
  downloadsToday: number | 'N/A';
}

async function fetchAllMetrics(): Promise<Metrics> {
  const config = getSupabaseConfig();
  if (!config) {
    return {
      totalUsers: 'N/A',
      newToday: 'N/A',
      newWeek: 'N/A',
      totalKeys: 'N/A',
      activeKeys: 'N/A',
      totalDownloads: 'N/A',
      downloadsToday: 'N/A',
    };
  }

  const { url, key } = config;
  const today = todayStartISO();
  const weekStart = weekStartISO();

  const [
    totalUsers,
    newToday,
    newWeek,
    totalKeys,
    activeKeys,
    totalDownloads,
    downloadsToday,
  ] = await Promise.all([
    queryCount(url, key, 'profiles'),
    queryCount(url, key, 'profiles', `created_at=gte.${today}`),
    queryCount(url, key, 'profiles', `created_at=gte.${weekStart}`),
    queryCount(url, key, 'api_keys'),
    queryCount(url, key, 'api_keys', `last_used_at=gte.${weekStart}`),
    queryCount(url, key, 'book_downloads'),
    queryCount(url, key, 'book_downloads', `created_at=gte.${today}`),
  ]);

  return {
    totalUsers,
    newToday,
    newWeek,
    totalKeys,
    activeKeys,
    totalDownloads,
    downloadsToday,
  };
}

export async function handleAnalyticsCommand(): Promise<string> {
  const metrics = await fetchAllMetrics();

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-AU', {
    timeZone: REPORT_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const lines = [
    `\u{1F4CA} Tork Daily Metrics \u2014 ${dateStr}`,
    '\u2501'.repeat(21),
    '',
    '\u{1F465} Users',
    `   Total: ${formatNum(metrics.totalUsers)}`,
    `   New today: ${formatNum(metrics.newToday)}`,
    `   New this week: ${formatNum(metrics.newWeek)}`,
    '',
    '\u{1F511} API Keys',
    `   Total: ${formatNum(metrics.totalKeys)}`,
    `   Active (7d): ${formatNum(metrics.activeKeys)}`,
    '',
    '\u{1F4D6} Book Downloads',
    `   Total: ${formatNum(metrics.totalDownloads)}`,
    `   Today: ${formatNum(metrics.downloadsToday)}`,
    '',
    '\u2501'.repeat(21),
    'Use @tork metrics anytime for on-demand stats.',
  ];

  logger.info({ metrics }, 'Tork analytics report generated');

  // Swarm: check for milestones (only when we have real numbers)
  if (
    typeof metrics.totalUsers === 'number' &&
    typeof metrics.newToday === 'number' &&
    typeof metrics.totalDownloads === 'number'
  ) {
    onAnalyticsReport({
      totalUsers: metrics.totalUsers,
      newToday: metrics.newToday,
      totalDownloads: metrics.totalDownloads,
    }).catch((err) => logger.error({ err }, 'Swarm onAnalyticsReport failed'));
  }

  return lines.join('\n');
}

function msUntilNext805AM(): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: REPORT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);

  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');

  const currentMinutes = hour * 60 + minute;
  const targetMinutes = REPORT_HOUR * 60 + REPORT_MINUTE;

  let diffMinutes = targetMinutes - currentMinutes;
  if (diffMinutes <= 0) {
    diffMinutes += 24 * 60;
  }

  return diffMinutes * 60 * 1000 - second * 1000;
}

export function startDailyMetricsTimer(
  sendMessage: (text: string) => Promise<void>,
): void {
  const scheduleNext = () => {
    const delay = msUntilNext805AM();
    const hours = Math.floor(delay / 3600000);
    const mins = Math.floor((delay % 3600000) / 60000);
    logger.info(
      { delayMs: delay, hours, mins },
      `Next analytics report scheduled in ${hours}h ${mins}m`,
    );

    setTimeout(async () => {
      try {
        const report = await handleAnalyticsCommand();
        await sendMessage(report);
      } catch (err) {
        logger.error({ err }, 'Tork scheduled analytics report failed');
      }
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}
