/**
 * Tork Signup Notifier (Skill 10)
 *
 * Polls the Supabase profiles table every 60 seconds for new rows.
 * Sends an instant WhatsApp notification when someone signs up.
 */
import fs from 'fs';
import path from 'path';

import { STORE_DIR } from './config.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import { onAnalyticsReport } from './tork-swarm.js';

const SIGNUP_PATTERN = /^@tork\s+signups\s*$/i;
const REQUEST_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 60_000;
const FIRST_POLL_DELAY_MS = 30_000;
const LAST_SEEN_FILE = path.join(STORE_DIR, 'signup-last-seen.json');
const BOOK_DL_LAST_SEEN_FILE = path.join(
  STORE_DIR,
  'book-download-last-seen.json',
);

interface LastSeenState {
  lastSeenAt: string;
  trackedCount: number;
  lastCheckTime: string;
}

let state: LastSeenState | null = null;
let bookDlState: LastSeenState | null = null;

function loadLastSeen(): LastSeenState | null {
  try {
    const data = fs.readFileSync(LAST_SEEN_FILE, 'utf-8');
    return JSON.parse(data) as LastSeenState;
  } catch {
    return null;
  }
}

function saveLastSeen(s: LastSeenState): void {
  fs.mkdirSync(path.dirname(LAST_SEEN_FILE), { recursive: true });
  fs.writeFileSync(LAST_SEEN_FILE, JSON.stringify(s, null, 2));
}

function getSupabaseConfig(): { url: string; key: string } | null {
  const env = readEnvFile(['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']);
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY;
  if (!url || !key || key === 'MISSING') return null;
  return { url, key };
}

interface ProfileRow {
  id: string;
  email?: string;
  created_at: string;
}

async function fetchRecentProfiles(
  baseUrl: string,
  apiKey: string,
): Promise<ProfileRow[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const url = `${baseUrl}/rest/v1/profiles?select=id,email,created_at&order=created_at.desc&limit=5`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Prefer: 'return=representation',
    },
    signal: controller.signal,
  });

  clearTimeout(timer);

  if (!response.ok) {
    throw new Error(`Supabase profiles query failed: ${response.status}`);
  }

  return (await response.json()) as ProfileRow[];
}

async function fetchTotalCount(
  baseUrl: string,
  apiKey: string,
): Promise<number | 'N/A'> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const url = `${baseUrl}/rest/v1/profiles?select=id&limit=1`;
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

    const match = contentRange.match(/\/(\d+)$/);
    return match ? parseInt(match[1], 10) : 'N/A';
  } catch {
    return 'N/A';
  }
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function isSignupRequest(content: string): boolean {
  return SIGNUP_PATTERN.test(content.trim());
}

export async function handleSignupCommand(): Promise<string> {
  const lastCheck = state?.lastCheckTime
    ? formatTime(state.lastCheckTime)
    : 'never';
  const tracked = state?.trackedCount ?? 0;

  return [
    '\u{1F195} Signup Notifier is active. Polling every 60s.',
    `Last check: ${lastCheck}`,
    `Total signups tracked: ${tracked}`,
  ].join('\n');
}

function loadBookDlLastSeen(): LastSeenState | null {
  try {
    const data = fs.readFileSync(BOOK_DL_LAST_SEEN_FILE, 'utf-8');
    return JSON.parse(data) as LastSeenState;
  } catch {
    return null;
  }
}

function saveBookDlLastSeen(s: LastSeenState): void {
  fs.mkdirSync(path.dirname(BOOK_DL_LAST_SEEN_FILE), { recursive: true });
  fs.writeFileSync(BOOK_DL_LAST_SEEN_FILE, JSON.stringify(s, null, 2));
}

interface BookDownloadRow {
  id: string;
  email?: string;
  created_at: string;
}

async function fetchRecentBookDownloads(
  baseUrl: string,
  apiKey: string,
): Promise<BookDownloadRow[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const url = `${baseUrl}/rest/v1/book_downloads?select=id,email,created_at&order=created_at.desc&limit=5`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Prefer: 'return=representation',
    },
    signal: controller.signal,
  });

  clearTimeout(timer);

  if (!response.ok) {
    throw new Error(`Supabase book_downloads query failed: ${response.status}`);
  }

  return (await response.json()) as BookDownloadRow[];
}

async function fetchBookDownloadCount(
  baseUrl: string,
  apiKey: string,
): Promise<number | 'N/A'> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const url = `${baseUrl}/rest/v1/book_downloads?select=id&limit=1`;
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

    const match = contentRange.match(/\/(\d+)$/);
    return match ? parseInt(match[1], 10) : 'N/A';
  } catch {
    return 'N/A';
  }
}

async function pollBookDownloads(
  sendMessage: (text: string) => Promise<void>,
  baseUrl: string,
  apiKey: string,
): Promise<void> {
  const downloads = await fetchRecentBookDownloads(baseUrl, apiKey);

  if (downloads.length === 0) return;

  const savedState = bookDlState ?? loadBookDlLastSeen();
  const isFirstRun = !savedState;

  if (isFirstRun) {
    bookDlState = {
      lastSeenAt: downloads[0].created_at,
      trackedCount: 0,
      lastCheckTime: new Date().toISOString(),
    };
    saveBookDlLastSeen(bookDlState);
    logger.info(
      { baseline: downloads[0].created_at },
      'Book download notifier: baseline set (first run, no alerts)',
    );
    return;
  }

  bookDlState = savedState;
  bookDlState.lastCheckTime = new Date().toISOString();

  const newDownloads = downloads.filter(
    (d) => d.created_at > bookDlState!.lastSeenAt,
  );

  if (newDownloads.length === 0) {
    saveBookDlLastSeen(bookDlState);
    return;
  }

  newDownloads.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const totalCount = await fetchBookDownloadCount(baseUrl, apiKey);

  for (const dl of newDownloads) {
    const identity = dl.email
      ? `\u{1F4E7} ${dl.email}`
      : `\u{1F194} User ID: ${dl.id}`;

    const message = [
      '\u{1F4D6} New Book Download!',
      '',
      identity,
      `\u{1F550} ${formatTime(dl.created_at)}`,
      `\u{1F4DA} Total downloads: ${totalCount === 'N/A' ? 'N/A' : totalCount.toLocaleString()}`,
      '',
      'Send welcome drip? \u2192 @tork content bookdrip 1',
    ].join('\n');

    await sendMessage(message);
    bookDlState.trackedCount++;
  }

  bookDlState.lastSeenAt = newDownloads[newDownloads.length - 1].created_at;
  saveBookDlLastSeen(bookDlState);

  logger.info(
    { newCount: newDownloads.length, totalTracked: bookDlState.trackedCount },
    'Book download notifier: new downloads detected',
  );
}

async function pollSignups(
  sendMessage: (text: string) => Promise<void>,
  url: string,
  key: string,
): Promise<void> {
  const profiles = await fetchRecentProfiles(url, key);

  if (profiles.length === 0) return;

  const savedState = state ?? loadLastSeen();
  const isFirstRun = !savedState;

  if (isFirstRun) {
    // First run: save baseline without alerting
    state = {
      lastSeenAt: profiles[0].created_at,
      trackedCount: 0,
      lastCheckTime: new Date().toISOString(),
    };
    saveLastSeen(state);
    logger.info(
      { baseline: profiles[0].created_at },
      'Signup notifier: baseline set (first run, no alerts)',
    );
    return;
  }

  state = savedState;
  state.lastCheckTime = new Date().toISOString();

  // Find new signups (created_at > last seen)
  const newSignups = profiles.filter((p) => p.created_at > state!.lastSeenAt);

  if (newSignups.length === 0) {
    saveLastSeen(state);
    return;
  }

  // Sort oldest first so we notify in order
  newSignups.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const totalCount = await fetchTotalCount(url, key);

  for (const signup of newSignups) {
    const identity = signup.email
      ? `\u{1F4E7} ${signup.email}`
      : `\u{1F194} User ID: ${signup.id}`;

    const message = [
      '\u{1F195} New Tork Signup!',
      '',
      identity,
      `\u{1F550} ${formatTime(signup.created_at)}`,
      `\u{1F465} Total users: ${totalCount === 'N/A' ? 'N/A' : totalCount.toLocaleString()}`,
      '',
      `Welcome them? \u2192 @tork content email welcome to ${signup.email || signup.id}`,
    ].join('\n');

    await sendMessage(message);
    state.trackedCount++;
  }

  // Update last seen to the most recent signup
  state.lastSeenAt = newSignups[newSignups.length - 1].created_at;
  saveLastSeen(state);

  logger.info(
    { newCount: newSignups.length, totalTracked: state.trackedCount },
    'Signup notifier: new signups detected',
  );

  // Swarm: check for milestones
  if (typeof totalCount === 'number') {
    onAnalyticsReport({
      totalUsers: totalCount,
      newToday: newSignups.length,
      totalDownloads: 0,
    }).catch((err) =>
      logger.error({ err }, 'Signup notifier: swarm onAnalyticsReport failed'),
    );
  }
}

async function poll(
  sendMessage: (text: string) => Promise<void>,
): Promise<void> {
  const config = getSupabaseConfig();
  if (!config) {
    logger.warn('Signup notifier: missing Supabase config');
    return;
  }

  const { url, key } = config;

  // Poll signups and book downloads in parallel
  await Promise.all([
    pollSignups(sendMessage, url, key).catch((err) =>
      logger.error({ err }, 'Signup poll error'),
    ),
    pollBookDownloads(sendMessage, url, key).catch((err) =>
      logger.error({ err }, 'Book download poll error'),
    ),
  ]);
}

export function startSignupNotifier(
  sendMessage: (text: string) => Promise<void>,
): void {
  // Load any persisted state
  state = loadLastSeen();
  bookDlState = loadBookDlLastSeen();

  setTimeout(() => {
    poll(sendMessage).catch((err) =>
      logger.error({ err }, 'Signup notifier poll failed'),
    );

    setInterval(() => {
      poll(sendMessage).catch((err) =>
        logger.error({ err }, 'Signup notifier poll failed'),
      );
    }, POLL_INTERVAL_MS);
  }, FIRST_POLL_DELAY_MS);
}
