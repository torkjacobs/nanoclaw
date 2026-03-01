/**
 * Tork Metrics Digest
 *
 * Daily 8 AM AEST digest with health check data, day count since launch,
 * and optional metrics from the Tork API. Responds on-demand to
 * "@tork digest" / "@tork morning".
 */
import { TIMEZONE } from './config.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import { checkEndpoints, EndpointResult } from './tork-monitor.js';

const LAUNCH_DATE = new Date('2026-02-24T00:00:00+11:00'); // Feb 24, 2026 AEST
const METRICS_API_URL = 'https://tork.network/api/v1/admin/metrics';
const REQUEST_TIMEOUT_MS = 10_000;
const DIGEST_HOUR = 8; // 8 AM
const DIGEST_TZ = 'Australia/Sydney'; // AEST/AEDT
const DAY_MS = 24 * 60 * 60 * 1000;

interface TorkMetrics {
  totalRequests?: number;
  piiDetections?: number;
  policiesEnforced?: number;
  activeUsers?: number;
  [key: string]: unknown;
}

const DIGEST_PATTERN = /^@tork\s+(digest|morning)\s*$/i;

export function isDigestRequest(content: string): boolean {
  return DIGEST_PATTERN.test(content.trim());
}

function getDaysSinceLaunch(): number {
  const now = new Date();
  return Math.floor((now.getTime() - LAUNCH_DATE.getTime()) / DAY_MS);
}

async function fetchMetrics(): Promise<TorkMetrics | null> {
  const env = readEnvFile(['TORK_API_KEY']);
  const apiKey = env.TORK_API_KEY;
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(METRICS_API_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) return null;

    return (await response.json()) as TorkMetrics;
  } catch {
    return null;
  }
}

function formatEndpointShort(r: EndpointResult): string {
  if (!r.ok) {
    return `\u2022 ${r.name}: \u274C ${r.error || `HTTP ${r.status}`}`;
  }
  return `\u2022 ${r.name}: \u2705 ${r.responseTimeMs}ms`;
}

export async function runDigest(): Promise<string> {
  const dayCount = getDaysSinceLaunch();
  const [endpoints, metrics] = await Promise.all([
    checkEndpoints(),
    fetchMetrics(),
  ]);

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

  const allHealthy = endpoints.every((r) => r.ok);
  const healthStatus = allHealthy
    ? '\u2705 All systems operational'
    : `\u26A0\uFE0F ${endpoints.filter((r) => !r.ok).length} service(s) degraded`;

  const lines: string[] = [
    `\u{1F4CA} Tork Daily Digest \u2014 Day ${dayCount} since launch`,
    '',
    `Status: ${healthStatus}`,
  ];

  // Endpoint details
  lines.push('');
  for (const r of endpoints) {
    lines.push(formatEndpointShort(r));
  }

  // Metrics section (if API is available)
  if (metrics) {
    lines.push('');
    lines.push('Metrics:');
    if (metrics.totalRequests != null)
      lines.push(`\u2022 Total requests: ${metrics.totalRequests.toLocaleString()}`);
    if (metrics.piiDetections != null)
      lines.push(`\u2022 PII detections: ${metrics.piiDetections.toLocaleString()}`);
    if (metrics.policiesEnforced != null)
      lines.push(`\u2022 Policies enforced: ${metrics.policiesEnforced.toLocaleString()}`);
    if (metrics.activeUsers != null)
      lines.push(`\u2022 Active users: ${metrics.activeUsers.toLocaleString()}`);
  }

  lines.push('');
  lines.push(`${timeStr} ${tzLabel}`);

  logger.info(
    { dayCount, allHealthy, hasMetrics: !!metrics },
    'Tork daily digest generated',
  );

  return lines.join('\n');
}

function msUntilNext8AM(): number {
  const now = new Date();
  // Get current time in AEST
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: DIGEST_TZ,
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

  // Minutes until 8 AM
  const currentMinutes = hour * 60 + minute;
  const targetMinutes = DIGEST_HOUR * 60;

  let diffMinutes = targetMinutes - currentMinutes;
  if (diffMinutes <= 0) {
    // Already past 8 AM today, schedule for tomorrow
    diffMinutes += 24 * 60;
  }

  return diffMinutes * 60 * 1000 - second * 1000;
}

export function startDigestTimer(
  sendMessage: (text: string) => Promise<void>,
): void {
  const scheduleNext = () => {
    const delay = msUntilNext8AM();
    const hours = Math.floor(delay / 3600000);
    const mins = Math.floor((delay % 3600000) / 60000);
    logger.info(
      { delayMs: delay, hours, mins },
      `Next digest scheduled in ${hours}h ${mins}m`,
    );

    setTimeout(async () => {
      try {
        const digest = await runDigest();
        await sendMessage(digest);
      } catch (err) {
        logger.error({ err }, 'Tork scheduled digest failed');
      }
      // Schedule the next one
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}
