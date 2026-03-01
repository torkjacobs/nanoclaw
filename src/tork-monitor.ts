/**
 * Tork Website Monitor
 *
 * Lightweight host-level health checker that:
 * - Runs every 6 hours on a timer (no container overhead)
 * - Checks Tork endpoints and posts status to the main group
 * - Responds on-demand to "@tork health" / "@tork status"
 */
import { TIMEZONE } from './config.js';
import { logger } from './logger.js';

interface EndpointConfig {
  name: string;
  url: string;
  acceptableStatuses: number[];
}

interface EndpointResult {
  name: string;
  status: number | null;
  responseTimeMs: number | null;
  ok: boolean;
  error?: string;
}

const ENDPOINTS: EndpointConfig[] = [
  {
    name: 'tork.network',
    url: 'https://tork.network',
    acceptableStatuses: [200],
  },
  {
    name: 'API /govern',
    url: 'https://tork.network/api/v1/govern',
    acceptableStatuses: [200, 401],
  },
  {
    name: 'demo.tork.network',
    url: 'https://demo.tork.network',
    acceptableStatuses: [200],
  },
  {
    name: 'innovation.tork.network',
    url: 'https://innovation.tork.network',
    acceptableStatuses: [200],
  },
];

const HEALTH_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const REQUEST_TIMEOUT_MS = 15_000;

async function checkEndpoint(
  endpoint: EndpointConfig,
): Promise<EndpointResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(endpoint.url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timer);
    const responseTimeMs = Date.now() - start;

    return {
      name: endpoint.name,
      status: response.status,
      responseTimeMs,
      ok: endpoint.acceptableStatuses.includes(response.status),
    };
  } catch (err: unknown) {
    return {
      name: endpoint.name,
      status: null,
      responseTimeMs: null,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runHealthCheck(): Promise<string> {
  const results = await Promise.all(ENDPOINTS.map(checkEndpoint));

  const allOk = results.every((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

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

  let message: string;

  if (allOk) {
    const lines = results.map(
      (r) => `\u2022 ${r.name}: ${r.status} (${r.responseTimeMs}ms)`,
    );
    message = [
      '\u{1F7E2} Tork Health Check \u2014 All Systems Operational',
      ...lines,
      `Last checked: ${timeStr} ${tzLabel}`,
    ].join('\n');
  } else {
    const failedLines = failed.map((r) => {
      if (r.status === null) {
        return `\u2022 ${r.name}: DOWN (${r.error || 'timeout'})`;
      }
      return `\u2022 ${r.name}: ${r.status} (${r.responseTimeMs}ms)`;
    });
    const okCount = results.length - failed.length;
    const suffix = okCount > 0 ? 'All other services operational.' : '';
    message = [
      '\u{1F534} Tork Alert \u2014 Service Degraded',
      ...failedLines,
      suffix,
      `Last checked: ${timeStr} ${tzLabel}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  logger.info(
    {
      allOk,
      endpoints: results.map((r) => ({
        name: r.name,
        status: r.status,
        ms: r.responseTimeMs,
      })),
    },
    'Tork health check completed',
  );

  return message;
}

const HEALTH_PATTERN = /^@tork\s+(health|status)\s*$/i;

export function isHealthCheckRequest(content: string): boolean {
  return HEALTH_PATTERN.test(content.trim());
}

export function startHealthCheckTimer(
  sendMessage: (text: string) => Promise<void>,
): ReturnType<typeof setInterval> {
  const runCheck = async () => {
    try {
      const result = await runHealthCheck();
      await sendMessage(result);
    } catch (err) {
      logger.error({ err }, 'Tork scheduled health check failed');
    }
  };

  // First check 30 seconds after startup (let WhatsApp connect first)
  setTimeout(runCheck, 30_000);

  return setInterval(runCheck, HEALTH_CHECK_INTERVAL_MS);
}
