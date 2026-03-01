/**
 * Tork Competitor Watch
 *
 * Monitors competitor websites for changes every 12 hours.
 * Fetches pages, strips HTML, hashes text content, compares to
 * stored hashes. Posts alerts only when changes are detected.
 * On-demand status via "@tork competitors" / "@tork watch".
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { TIMEZONE } from './config.js';
import { logger } from './logger.js';

interface CompetitorConfig {
  name: string;
  url: string;
  category: string;
}

interface CompetitorHash {
  hash: string;
  lastChecked: string;
  lastChanged: string;
}

type HashStore = Record<string, CompetitorHash>;

const COMPETITORS: CompetitorConfig[] = [
  { name: 'lakera.ai', url: 'https://www.lakera.ai', category: 'AI security' },
  {
    name: 'calypsoai.com',
    url: 'https://www.calypsoai.com',
    category: 'AI governance',
  },
  {
    name: 'arthurai.com',
    url: 'https://www.arthurai.com',
    category: 'AI monitoring',
  },
  {
    name: 'robust-intelligence.com',
    url: 'https://www.robust-intelligence.com',
    category: 'AI security',
  },
  {
    name: 'protectai.com',
    url: 'https://protectai.com',
    category: 'AI security',
  },
];

const HASH_FILE = path.join(process.cwd(), 'store', 'competitor-hashes.json');
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
const REQUEST_TIMEOUT_MS = 15_000;

const WATCH_PATTERN = /^@tork\s+(competitors|watch)\s*$/i;

export function isCompetitorWatchRequest(content: string): boolean {
  return WATCH_PATTERN.test(content.trim());
}

function loadHashes(): HashStore {
  try {
    const data = fs.readFileSync(HASH_FILE, 'utf-8');
    return JSON.parse(data) as HashStore;
  } catch {
    return {};
  }
}

function saveHashes(store: HashStore): void {
  fs.mkdirSync(path.dirname(HASH_FILE), { recursive: true });
  fs.writeFileSync(HASH_FILE, JSON.stringify(store, null, 2));
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'TorkBot/1.0' },
    });

    clearTimeout(timer);

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface CheckResult {
  name: string;
  changed: boolean;
  error: boolean;
  lastChecked: string;
  lastChanged: string;
}

export async function checkCompetitors(): Promise<{
  results: CheckResult[];
  isFirstRun: boolean;
}> {
  const store = loadHashes();
  const isFirstRun = Object.keys(store).length === 0;
  const now = new Date().toISOString();
  const results: CheckResult[] = [];

  // Suppress TLS errors for competitor fetches
  const originalTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    const fetches = await Promise.allSettled(
      COMPETITORS.map(async (comp) => {
        const html = await fetchPage(comp.url);
        if (!html) {
          return {
            name: comp.name,
            changed: false,
            error: true,
            lastChecked: store[comp.name]?.lastChecked || now,
            lastChanged: store[comp.name]?.lastChanged || '',
          };
        }

        const text = stripHtml(html);
        const newHash = hashText(text);
        const existing = store[comp.name];
        const changed = !!existing && existing.hash !== newHash;

        store[comp.name] = {
          hash: newHash,
          lastChecked: now,
          lastChanged: changed ? now : existing?.lastChanged || now,
        };

        return {
          name: comp.name,
          changed,
          error: false,
          lastChecked: now,
          lastChanged: store[comp.name].lastChanged,
        };
      }),
    );

    for (const result of fetches) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }
  } finally {
    if (originalTls === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTls;
    }
  }

  saveHashes(store);
  return { results, isFirstRun };
}

export async function runCompetitorCheck(): Promise<string | null> {
  const { results, isFirstRun } = await checkCompetitors();

  logger.info(
    {
      isFirstRun,
      changed: results.filter((r) => r.changed).map((r) => r.name),
      errors: results.filter((r) => r.error).map((r) => r.name),
    },
    'Competitor check completed',
  );

  if (isFirstRun) {
    logger.info('First competitor check run — hashes stored silently');
    return null;
  }

  const changed = results.filter((r) => r.changed);
  if (changed.length === 0) return null; // Silent when no changes

  const unchanged = results.filter((r) => !r.changed && !r.error);
  const errors = results.filter((r) => r.error);

  const lines: string[] = [
    '\u{1F50D} Competitor Alert \u2014 Changes Detected',
  ];

  for (const r of changed) {
    lines.push(
      `\u2022 ${r.name}: Homepage updated (last checked: ${timeAgo(r.lastChecked)})`,
    );
  }

  if (unchanged.length > 0) {
    lines.push(`No changes: ${unchanged.map((r) => r.name).join(', ')}`);
  }

  if (errors.length > 0) {
    lines.push(`Unreachable: ${errors.map((r) => r.name).join(', ')}`);
  }

  return lines.join('\n');
}

export async function getCompetitorStatus(): Promise<string> {
  const store = loadHashes();
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

  const lines: string[] = ['\u{1F50D} Competitor Watch \u2014 Status'];

  if (Object.keys(store).length === 0) {
    lines.push('', 'No data yet. First check will run shortly.');
    return lines.join('\n');
  }

  lines.push('');
  for (const comp of COMPETITORS) {
    const entry = store[comp.name];
    if (!entry) {
      lines.push(`\u2022 ${comp.name} (${comp.category}): Not yet checked`);
      continue;
    }
    const checkedAgo = timeAgo(entry.lastChecked);
    const changedAgo = timeAgo(entry.lastChanged);
    lines.push(
      `\u2022 ${comp.name} (${comp.category}): checked ${checkedAgo}, last change ${changedAgo}`,
    );
  }

  lines.push('', `${timeStr} ${tzLabel}`);
  return lines.join('\n');
}

export function startCompetitorWatchTimer(
  sendMessage: (text: string) => Promise<void>,
): ReturnType<typeof setInterval> {
  const runCheck = async () => {
    try {
      const result = await runCompetitorCheck();
      if (result) await sendMessage(result);
    } catch (err) {
      logger.error({ err }, 'Tork competitor check failed');
    }
  };

  // First check 60 seconds after startup
  setTimeout(runCheck, 60_000);

  return setInterval(runCheck, CHECK_INTERVAL_MS);
}
