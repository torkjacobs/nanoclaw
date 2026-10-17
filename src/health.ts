/**
 * Health heartbeat (MO-02, report mode). NanoClaw has no HTTP server, so it
 * writes data/health.json once a minute instead of serving /api/health. Same
 * shape as the web apps' health routes: status, sha and the NAMES of required
 * settings that are missing (never their values). Missing settings are
 * reported, not enforced: status stays "ok". A reader treats a stale
 * updated_at as down.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { readEnvFile } from './env.js';
import { logger } from './logger.js';

export const HEALTH_FILE = path.join(process.cwd(), 'data', 'health.json');
export const HEALTH_INTERVAL_MS = 60_000;

/** Every group of names must have at least one set (alternatives share a group). */
export const REQUIRED_ENV: string[][] = [
  ['SUPABASE_URL'],
  ['SUPABASE_SERVICE_KEY'],
  ['TORK_API_KEY'],
  ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'],
];

export interface Health {
  status: 'ok';
  sha: string | null;
  pid: number;
  started_at: string;
  updated_at: string;
  rss_mb: number;
  heap_used_mb: number;
  missing: string[];
}

export function missingEnv(env: Record<string, string>): string[] {
  const isSet = (name: string) => !!env[name] && env[name] !== 'MISSING';
  return REQUIRED_ENV.filter((group) => !group.some(isSet)).map((group) =>
    group.join('|'),
  );
}

function readSha(): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

export function buildHealth(
  startedAt: string,
  sha: string | null,
  now: Date = new Date(),
): Health {
  const mem = process.memoryUsage();
  const env = readEnvFile(REQUIRED_ENV.flat());
  return {
    status: 'ok',
    sha,
    pid: process.pid,
    started_at: startedAt,
    updated_at: now.toISOString(),
    rss_mb: Math.round(mem.rss / 1048576),
    heap_used_mb: Math.round(mem.heapUsed / 1048576),
    missing: missingEnv(env),
  };
}

export function writeHealth(health: Health, file: string = HEALTH_FILE): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(health, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export function startHealthHeartbeat(): NodeJS.Timeout {
  const startedAt = new Date().toISOString();
  const sha = readSha();
  const beat = () => {
    try {
      writeHealth(buildHealth(startedAt, sha));
    } catch (err) {
      logger.warn({ err }, 'Health heartbeat write failed');
    }
  };
  beat();
  const timer = setInterval(beat, HEALTH_INTERVAL_MS);
  timer.unref();
  return timer;
}
