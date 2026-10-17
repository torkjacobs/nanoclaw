import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { buildHealth, missingEnv, writeHealth } from './health.js';

describe('missingEnv', () => {
  it('reports nothing when every required group is set', () => {
    expect(
      missingEnv({
        SUPABASE_URL: 'u',
        SUPABASE_SERVICE_KEY: 'k',
        TORK_API_KEY: 't',
        ANTHROPIC_API_KEY: 'a',
      }),
    ).toEqual([]);
  });

  it('accepts either model credential', () => {
    expect(
      missingEnv({
        SUPABASE_URL: 'u',
        SUPABASE_SERVICE_KEY: 'k',
        TORK_API_KEY: 't',
        CLAUDE_CODE_OAUTH_TOKEN: 'o',
      }),
    ).toEqual([]);
  });

  it('names missing settings, treating the MISSING placeholder as unset', () => {
    expect(
      missingEnv({ SUPABASE_URL: 'u', SUPABASE_SERVICE_KEY: 'MISSING' }),
    ).toEqual([
      'SUPABASE_SERVICE_KEY',
      'TORK_API_KEY',
      'CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY',
    ]);
  });
});

describe('heartbeat file', () => {
  it('writes names only, never values', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-health-'));
    const file = path.join(dir, 'data', 'health.json');
    const health = buildHealth(
      '2026-10-17T00:00:00.000Z',
      'abc123',
      new Date('2026-10-17T00:01:00.000Z'),
    );
    writeHealth(health, file);
    const body = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(body.status).toBe('ok');
    expect(body.sha).toBe('abc123');
    expect(body.updated_at).toBe('2026-10-17T00:01:00.000Z');
    expect(Object.keys(body).sort()).toEqual(
      [
        'heap_used_mb',
        'missing',
        'pid',
        'rss_mb',
        'sha',
        'started_at',
        'status',
        'updated_at',
      ].sort(),
    );
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
