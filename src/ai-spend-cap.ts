/**
 * Per-tenant AI spend caps and a per-tenant circuit breaker (R4, Architecture Challenge v2).
 *
 * CANONICAL SOURCE: torkjacobs/tork-common src/ratelimit/ai-spend-cap.ts. Products carry a
 * byte-identical copy (like the E-17 ratelimit.ts) until @tork/ratelimit (E-20) is published.
 * Python mirror: torkjacobs/tork-chat-engine app/core/ai_spend_cap.py. Both use the SAME Redis
 * keys and the SAME integer arithmetic, so one tenant has one budget whichever language spends
 * it; tests in both repos pin their output to tests/fixtures/ai-spend-cap.fixture.json.
 *
 * SWITCH: AI_SPEND_CAPS=on (or 1/true). Default off: every function returns at once, makes no
 * network call and logs nothing, so a product's behaviour is unchanged until it is turned on.
 *
 * STORE: Upstash REST (UPSTASH_REDIS_REST_URL / _TOKEN, falling back to KV_REST_API_URL / _TOKEN),
 * the same database as the rate limiter. Amounts are integer micro-dollars (INCRBY), never floats.
 * AI_SPEND_NAMESPACE (optional, [A-Za-z0-9_-], other characters dropped) separates staging from
 * production when they share one database.
 *
 * CAPS live in Redis: hash <prefix>caps, field "default" plus one field per tenant key, each JSON
 * {"hourly_usd": n, "daily_usd": n}. A missing value falls back to the "default" field, then to
 * AI_SPEND_HOURLY_USD / AI_SPEND_DAILY_USD, then to DEFAULT_HOURLY_USD / DEFAULT_DAILY_USD.
 * A cap of 0 blocks the tenant. Hours and days are UTC.
 *
 * CHECK (before a paid call): spent this hour + estimate > hourly cap, or the same for the day,
 * refuses with 429 and opens the tenant's breaker.
 * BREAKER: opens after AI_BREAKER_FAILURES (default 5) consecutive provider failures, or when a
 * cap is hit. It refuses for AI_BREAKER_COOLDOWN_S (default 60), then goes half-open: ONE probe
 * call is let through; a recorded success (recordSpend) closes it, a failure re-opens it.
 *
 * FAIL-CLOSED (the trade-off): with the switch on, a store that is unconfigured, erroring or
 * slower than STORE_TIMEOUT_MS refuses the call (503). An Upstash outage therefore stops that
 * product's AI Assistant. Failing open instead would let a runaway loop spend without limit at
 * exactly the moment nobody can see it. The emergency override is AI_SPEND_CAPS=off.
 * Recording (recordSpend, recordProviderFailure) never throws: the money is already spent.
 *
 * OVERSHOOT: this is check-then-record, not a reservation. Calls already in flight when the cap
 * is reached still complete, so a tenant can pass its cap by at most (concurrency x one call).
 *
 * EVENTS (one JSON line each, no prompt or answer content): `ai_spend` for every recorded call
 * (tenant, usd, hour_usd, day_usd, hour) and `ai_breaker_open` (tenant, reason, cooldown_s).
 * Spend per tenant per hour is also kept for 48 h in the sorted set <prefix>h:<YYYYMMDDHH>.
 *
 * No imports: safe for Node, Edge and browser-free server bundles.
 */

export type AiSpendEnv = Readonly<Record<string, string | undefined>>;
export type AiSpendReason =
  | 'disabled' | 'ok' | 'half_open' | 'hourly_cap' | 'daily_cap' | 'breaker_open'
  | 'no_tenant' | 'unconfigured' | 'error';
export type AiBreakerReason = 'hourly_cap' | 'daily_cap' | 'provider_failures';

export interface AiSpendDecision {
  allowed: boolean;
  status: 200 | 429 | 503;
  reason: AiSpendReason;
  /** Why an open breaker opened (only when reason is breaker_open). */
  breakerReason?: AiBreakerReason;
  tenant: string | null;
  hourUsd: number;
  dayUsd: number;
  hourlyCapUsd: number;
  dailyCapUsd: number;
  retryAfterSeconds: number;
}

export interface AiSpendRecord {
  recorded: boolean;
  reason: 'disabled' | 'ok' | 'unconfigured' | 'error';
  tenant: string | null;
  hourUsd: number;
  dayUsd: number;
  breakerOpened: AiBreakerReason | null;
}

export interface AiSpendOptions {
  /** Defaults to process.env. */
  env?: AiSpendEnv;
  /** Milliseconds since the epoch. Defaults to Date.now(). */
  now?: number;
  /** Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Product name on emitted events (e.g. "tork-chat"). */
  product?: string;
  /** Receives each JSON event line. Defaults to console.info / console.warn. */
  log?: (line: string, level: 'info' | 'warn') => void;
}

export interface LimiterStatus {
  /** True when the shared Upstash store is configured and the rate-limit kill switch is off. */
  configured: boolean;
  store: boolean;
  rateLimitDisabled: boolean;
  spendCaps: 'on' | 'off';
}

export const AI_SPEND_KEY_VERSION = 'v1';
/** Proposed defaults only. The real values per tenant are Yusuf's call (set them in Redis). */
export const DEFAULT_HOURLY_USD = 5;
export const DEFAULT_DAILY_USD = 50;
export const DEFAULT_BREAKER_FAILURES = 5;
export const DEFAULT_BREAKER_COOLDOWN_S = 60;
/** Charged against the cap for a call with no token counts and no price. */
export const UNPRICED_CALL_USD = 0.05;
/** Recorded against when a paid call has no tenant (visible in metrics, never checked). */
export const UNATTRIBUTED_TENANT = '_unattributed';
export const STORE_TIMEOUT_MS = 1500;
export const HOUR_TTL_S = 7200;
export const DAY_TTL_S = 172800;
export const METRIC_TTL_S = 172800;
export const FAILS_TTL_S = 3600;
const MICRO = 1_000_000;
const MAX_CALL_USD = 1_000_000;

/**
 * Ceiling rates (USD per million tokens: input, output) used ONLY to charge the cap when the
 * caller has no sourced price. Matched by substring of the lower-cased model id, first match
 * wins; an unknown model is charged at the highest rate. These are upper bounds for a budget,
 * never written to ai_spend_events as a cost.
 */
export const CEILING_RATES: ReadonlyArray<readonly [string, number, number]> = [
  ['fable', 10, 50],
  ['opus', 15, 75],
  ['sonnet', 3, 15],
  ['haiku', 1, 5],
  ['embedding', 0.13, 0],
];
export const UNKNOWN_MODEL_RATE: readonly [number, number] = [15, 75];

const SAFE_TENANT = /^[A-Za-z0-9_.-]{1,128}$/;
let lastStoreWarn = 0;

function envOf(o?: AiSpendOptions): AiSpendEnv {
  if (o?.env) return o.env;
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

/** The product switch. Only "on", "1" or "true" (any case) turns caps on. */
export function aiSpendCapsEnabled(env: AiSpendEnv = envOf()): boolean {
  const v = (env.AI_SPEND_CAPS ?? '').trim().toLowerCase();
  return v === 'on' || v === '1' || v === 'true';
}

function storeOf(env: AiSpendEnv): { url: string; token: string } | null {
  const url = (env.UPSTASH_REDIS_REST_URL?.trim() || env.KV_REST_API_URL?.trim() || '').replace(/\/+$/, '');
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim() || env.KV_REST_API_TOKEN?.trim() || '';
  return url && token ? { url, token } : null;
}

/** Detail for health routes. Never includes the store URL or token. */
export function limiterStatus(env: AiSpendEnv = envOf()): LimiterStatus {
  const store = storeOf(env) !== null;
  const rateLimitDisabled = env.RATE_LIMIT_DISABLED === '1';
  return { configured: store && !rateLimitDisabled, store, rateLimitDisabled, spendCaps: aiSpendCapsEnabled(env) ? 'on' : 'off' };
}

/** For health routes: false means requests are not being limited and health should fail. */
export function limiterConfigured(env: AiSpendEnv = envOf()): boolean {
  return limiterStatus(env).configured;
}

// Strict number formats so TypeScript and Python read every setting the same way
// (Number() would also accept " 5", "0x10" and "1e3"; Python's float() differs on those).
const INT_TEXT = /^[0-9]{1,9}$/;
const DECIMAL_TEXT = /^(?:[0-9]{1,12}(?:\.[0-9]{0,12})?|\.[0-9]{1,12})$/;

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = typeof raw === 'string' && INT_TEXT.test(raw) ? Number(raw) : NaN;
  return n > 0 ? n : fallback;
}

/** A cap in USD: a finite JSON number >= 0, or a plain decimal string. Anything else is unset. */
function capNumber(raw: unknown): number | null {
  const n = typeof raw === 'string' ? (DECIMAL_TEXT.test(raw) ? Number(raw) : NaN) : raw;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

export function breakerFailures(env: AiSpendEnv = envOf()): number {
  return positiveInt(env.AI_BREAKER_FAILURES, DEFAULT_BREAKER_FAILURES);
}

export function breakerCooldownSeconds(env: AiSpendEnv = envOf()): number {
  return positiveInt(env.AI_BREAKER_COOLDOWN_S, DEFAULT_BREAKER_COOLDOWN_S);
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** UTC hour bucket, YYYYMMDDHH. */
export function hourBucket(nowMs: number): string {
  const d = new Date(nowMs);
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}`;
}

/** UTC day bucket, YYYYMMDD. */
export function dayBucket(nowMs: number): string {
  return hourBucket(nowMs).slice(0, 8);
}

/** Key prefix, including the optional namespace. */
export function aiSpendPrefix(env: AiSpendEnv = envOf()): string {
  const ns = (env.AI_SPEND_NAMESPACE ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return `tork:aispend:${AI_SPEND_KEY_VERSION}:${ns ? `${ns}:` : ''}`;
}

/**
 * The tenant's key component: the id itself when it is 1-128 of [A-Za-z0-9_.-] (slugs and
 * UUIDs), otherwise "h_" + the first 32 hex characters of SHA-256(UTF-8 id). Null when empty.
 */
export async function aiSpendTenantKey(tenantId: string | null | undefined): Promise<string | null> {
  if (typeof tenantId !== 'string' || tenantId.length === 0) return null;
  if (SAFE_TENANT.test(tenantId)) return tenantId;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tenantId));
  const hex = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  return `h_${hex.slice(0, 32)}`;
}

export interface AiSpendKeys {
  caps: string;
  hour: string;
  day: string;
  hourIndex: string;
  open: string;
  fails: string;
  probe: string;
}

export function aiSpendKeys(tenantKey: string, nowMs: number, env: AiSpendEnv = envOf()): AiSpendKeys {
  const p = aiSpendPrefix(env);
  const h = hourBucket(nowMs);
  const t = `${p}t:${tenantKey}:`;
  return {
    caps: `${p}caps`,
    hour: `${t}h:${h}`,
    day: `${t}d:${h.slice(0, 8)}`,
    hourIndex: `${p}h:${h}`,
    open: `${t}breaker:open`,
    fails: `${t}breaker:fails`,
    probe: `${t}breaker:probe`,
  };
}

/** USD to integer micro-dollars, rounding half up. Non-finite or negative is 0. */
export function toMicroUsd(usd: number): number {
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) return 0;
  return Math.floor(Math.min(usd, MAX_CALL_USD) * MICRO + 0.5);
}

function fromMicro(micro: number): number {
  return micro / MICRO;
}

function tokenCount(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** A ceiling USD estimate for one call, for charging the cap when no sourced price exists. */
export function ceilingUsd(call: { model?: string | null; tokensIn?: number | null; tokensOut?: number | null }): number {
  const tin = tokenCount(call.tokensIn);
  const tout = tokenCount(call.tokensOut);
  if (tin === null && tout === null) return UNPRICED_CALL_USD;
  const model = (call.model ?? '').toLowerCase();
  const hit = CEILING_RATES.find(([needle]) => model.includes(needle));
  const inRate = hit ? hit[1] : UNKNOWN_MODEL_RATE[0];
  const outRate = hit ? hit[2] : UNKNOWN_MODEL_RATE[1];
  return ((tin ?? 0) * inRate + (tout ?? 0) * outRate) / MICRO;
}

/** What to charge the cap: the sourced cost when there is one, else the ceiling estimate. */
export function capChargeUsd(costUsd: number | null | undefined,
  call: { model?: string | null; tokensIn?: number | null; tokensOut?: number | null }): number {
  return typeof costUsd === 'number' && Number.isFinite(costUsd) && costUsd >= 0 ? costUsd : ceilingUsd(call);
}

interface Caps { hourlyMicro: number; dailyMicro: number }

function parseCapField(raw: unknown): { hourly: number | null; daily: number | null } {
  if (typeof raw !== 'string' || raw === '') return { hourly: null, daily: null };
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { hourly: null, daily: null };
    const o = v as Record<string, unknown>;
    return { hourly: capNumber(o.hourly_usd), daily: capNumber(o.daily_usd) };
  } catch {
    return { hourly: null, daily: null };
  }
}

/** Tenant field, then default field, then env, then built-in default. Exported for the fixture. */
export function resolveCaps(tenantField: unknown, defaultField: unknown, env: AiSpendEnv = envOf()): { hourlyUsd: number; dailyUsd: number } {
  const t = parseCapField(tenantField);
  const d = parseCapField(defaultField);
  const hourly = t.hourly ?? d.hourly ?? capNumber(env.AI_SPEND_HOURLY_USD) ?? DEFAULT_HOURLY_USD;
  const daily = t.daily ?? d.daily ?? capNumber(env.AI_SPEND_DAILY_USD) ?? DEFAULT_DAILY_USD;
  return { hourlyUsd: hourly, dailyUsd: daily };
}

function capsMicro(c: { hourlyUsd: number; dailyUsd: number }): Caps {
  return { hourlyMicro: toMicroUsd(c.hourlyUsd), dailyMicro: toMicroUsd(c.dailyUsd) };
}

function over(spentMicro: number, estMicro: number, capMicro: number): boolean {
  return capMicro === 0 || spentMicro + estMicro > capMicro;
}

function parseCount(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number' && Number.isSafeInteger(v)) return v;
  if (typeof v === 'string' && /^-?\d+$/.test(v)) {
    const n = Number(v);
    if (Number.isSafeInteger(n)) return n;
  }
  throw new Error('Invalid store value');
}

function emit(o: AiSpendOptions, level: 'info' | 'warn', payload: Record<string, unknown>): void {
  try {
    const line = JSON.stringify({ ...payload, product: o.product ?? null, ts: new Date(o.now ?? Date.now()).toISOString() });
    if (o.log) o.log(line, level);
    else if (level === 'warn') console.warn(line);
    else console.info(line);
  } catch { /* logging never breaks a call */ }
}

function storeWarning(o: AiSpendOptions, reason: 'unconfigured' | 'error'): void {
  const now = Date.now();
  if (now - lastStoreWarn < 60_000) return;
  lastStoreWarn = now;
  emit(o, 'warn', { event: 'ai_spend_store_unavailable', reason });
}

type Command = Array<string | number>;

async function pipeline(commands: Command[], o: AiSpendOptions): Promise<unknown[]> {
  const store = storeOf(envOf(o));
  if (!store) throw new Error('Store unconfigured');
  const doFetch = o.fetch ?? fetch;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = (async () => {
    const response = await doFetch(`${store.url}/pipeline`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${store.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!response.ok) throw new Error('Store unavailable');
    const body: unknown = await response.json();
    if (!Array.isArray(body) || body.length !== commands.length) throw new Error('Invalid store response');
    return body.map((item: unknown) => {
      if (!item || typeof item !== 'object' || 'error' in item || !('result' in item)) throw new Error('Invalid store response');
      return (item as { result: unknown }).result;
    });
  })();
  work.catch(() => { /* a late failure after the timeout is already handled */ });
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Store timeout')); }, STORE_TIMEOUT_MS);
    })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function decision(reason: AiSpendReason, status: 200 | 429 | 503, tenant: string | null, extra: Partial<AiSpendDecision> = {}): AiSpendDecision {
  return {
    allowed: status === 200, status, reason, tenant,
    hourUsd: 0, dayUsd: 0, hourlyCapUsd: 0, dailyCapUsd: 0,
    retryAfterSeconds: status === 200 ? 0 : 1,
    ...extra,
  };
}

function secondsUntil(nowMs: number, periodMs: number): number {
  return Math.max(1, Math.ceil(((Math.floor(nowMs / periodMs) + 1) * periodMs - nowMs) / 1000));
}

async function openBreaker(keys: AiSpendKeys, tenant: string, reason: AiBreakerReason, o: AiSpendOptions,
  detail: Record<string, unknown>): Promise<boolean> {
  const cooldown = breakerCooldownSeconds(envOf(o));
  try {
    const [result] = await pipeline([['SET', keys.open, reason, 'NX', 'PX', cooldown * 1000]], o);
    if (result !== 'OK') return false;
    emit(o, 'warn', { event: 'ai_breaker_open', tenant, reason, cooldown_s: cooldown, ...detail });
    return true;
  } catch {
    storeWarning(o, 'error');
    return false;
  }
}

/**
 * Before a paid call: may this tenant spend about `estUsd` now? Switch off: always allowed, no
 * I/O. Switch on: one store round trip (two when the breaker is half-open or a cap is hit).
 */
export async function checkSpend(tenantId: string, estUsd: number, o: AiSpendOptions = {}): Promise<AiSpendDecision> {
  const env = envOf(o);
  if (!aiSpendCapsEnabled(env)) return decision('disabled', 200, null);
  const now = o.now ?? Date.now();
  const tenant = await aiSpendTenantKey(tenantId);
  if (!tenant) return decision('no_tenant', 503, null);
  if (!storeOf(env)) {
    storeWarning(o, 'unconfigured');
    return decision('unconfigured', 503, tenant);
  }
  const keys = aiSpendKeys(tenant, now, env);
  try {
    const r = await pipeline([
      ['HGET', keys.caps, tenant], ['HGET', keys.caps, 'default'],
      ['GET', keys.hour], ['GET', keys.day],
      ['PTTL', keys.open], ['GET', keys.open], ['GET', keys.fails],
    ], o);
    const caps = resolveCaps(r[0], r[1], env);
    const micro = capsMicro(caps);
    const hourMicro = parseCount(r[2]);
    const dayMicro = parseCount(r[3]);
    const openTtl = parseCount(r[4]);
    const openReason = typeof r[5] === 'string' ? r[5] as AiBreakerReason : undefined;
    const fails = parseCount(r[6]);
    const est = toMicroUsd(estUsd);
    const base = { hourUsd: fromMicro(hourMicro), dayUsd: fromMicro(dayMicro), hourlyCapUsd: caps.hourlyUsd, dailyCapUsd: caps.dailyUsd };
    const cooldown = breakerCooldownSeconds(env);

    if (openTtl !== -2) {
      const status = openReason === 'provider_failures' ? 503 : 429;
      return decision('breaker_open', status, tenant, { ...base, breakerReason: openReason,
        retryAfterSeconds: openTtl > 0 ? Math.max(1, Math.ceil(openTtl / 1000)) : cooldown });
    }
    const detail = { hour_usd: base.hourUsd, day_usd: base.dayUsd, hourly_cap_usd: caps.hourlyUsd, daily_cap_usd: caps.dailyUsd, est_usd: fromMicro(est) };
    if (over(hourMicro, est, micro.hourlyMicro)) {
      await openBreaker(keys, tenant, 'hourly_cap', o, detail);
      return decision('hourly_cap', 429, tenant, { ...base, retryAfterSeconds: secondsUntil(now, 3_600_000) });
    }
    if (over(dayMicro, est, micro.dailyMicro)) {
      await openBreaker(keys, tenant, 'daily_cap', o, detail);
      return decision('daily_cap', 429, tenant, { ...base, retryAfterSeconds: secondsUntil(now, 86_400_000) });
    }
    if (fails >= breakerFailures(env)) {
      const [probe] = await pipeline([['SET', keys.probe, String(now), 'NX', 'PX', cooldown * 1000]], o);
      if (probe === 'OK') return decision('half_open', 200, tenant, base);
      return decision('breaker_open', 503, tenant, { ...base, breakerReason: 'provider_failures', retryAfterSeconds: cooldown });
    }
    return decision('ok', 200, tenant, base);
  } catch {
    storeWarning(o, 'error');
    return decision('error', 503, tenant);
  }
}

/**
 * After a successful paid call: add `usd` to the tenant's hour and day, emit `ai_spend`, close a
 * half-open breaker, and open the breaker if a cap is now passed. Never throws.
 */
export async function recordSpend(tenantId: string | null | undefined, usd: number, o: AiSpendOptions = {}): Promise<AiSpendRecord> {
  const env = envOf(o);
  const none: AiSpendRecord = { recorded: false, reason: 'disabled', tenant: null, hourUsd: 0, dayUsd: 0, breakerOpened: null };
  if (!aiSpendCapsEnabled(env)) return none;
  try {
    const now = o.now ?? Date.now();
    const tenant = (await aiSpendTenantKey(tenantId ?? null)) ?? UNATTRIBUTED_TENANT;
    if (!storeOf(env)) {
      storeWarning(o, 'unconfigured');
      return { ...none, reason: 'unconfigured', tenant };
    }
    const keys = aiSpendKeys(tenant, now, env);
    const micro = toMicroUsd(usd);
    const r = await pipeline([
      ['INCRBY', keys.hour, micro], ['EXPIRE', keys.hour, HOUR_TTL_S],
      ['INCRBY', keys.day, micro], ['EXPIRE', keys.day, DAY_TTL_S],
      ['ZINCRBY', keys.hourIndex, micro, tenant], ['EXPIRE', keys.hourIndex, METRIC_TTL_S],
      ['DEL', keys.fails], ['DEL', keys.probe],
      ['HGET', keys.caps, tenant], ['HGET', keys.caps, 'default'],
    ], o);
    const hourMicro = parseCount(r[0]);
    const dayMicro = parseCount(r[2]);
    const hourUsd = fromMicro(hourMicro);
    const dayUsd = fromMicro(dayMicro);
    emit(o, 'info', { event: 'ai_spend', tenant, usd: fromMicro(micro), hour_usd: hourUsd, day_usd: dayUsd, hour: hourBucket(now) });
    let breakerOpened: AiBreakerReason | null = null;
    if (tenant !== UNATTRIBUTED_TENANT) {
      const caps = resolveCaps(r[8], r[9], env);
      const capMicro = capsMicro(caps);
      const reason: AiBreakerReason | null = hourMicro > capMicro.hourlyMicro ? 'hourly_cap' : dayMicro > capMicro.dailyMicro ? 'daily_cap' : null;
      if (reason && await openBreaker(keys, tenant, reason, o, { hour_usd: hourUsd, day_usd: dayUsd, hourly_cap_usd: caps.hourlyUsd, daily_cap_usd: caps.dailyUsd })) breakerOpened = reason;
    }
    return { recorded: true, reason: 'ok', tenant, hourUsd, dayUsd, breakerOpened };
  } catch {
    storeWarning(o, 'error');
    return { ...none, reason: 'error' };
  }
}

/** After a provider failure (see isProviderFailure): count it; open the breaker at the threshold. Never throws. */
export async function recordProviderFailure(tenantId: string | null | undefined, o: AiSpendOptions = {}): Promise<{ failures: number; opened: boolean }> {
  const env = envOf(o);
  if (!aiSpendCapsEnabled(env)) return { failures: 0, opened: false };
  try {
    const tenant = await aiSpendTenantKey(tenantId ?? null);
    if (!tenant || !storeOf(env)) return { failures: 0, opened: false };
    const keys = aiSpendKeys(tenant, o.now ?? Date.now(), env);
    const r = await pipeline([['INCR', keys.fails], ['EXPIRE', keys.fails, FAILS_TTL_S], ['DEL', keys.probe]], o);
    const failures = parseCount(r[0]);
    const opened = failures >= breakerFailures(env)
      ? await openBreaker(keys, tenant, 'provider_failures', o, { failures })
      : false;
    return { failures, opened };
  } catch {
    storeWarning(o, 'error');
    return { failures: 0, opened: false };
  }
}

/**
 * True for errors that mean the PROVIDER failed (5xx, 429, 529, connection or timeout), not the
 * caller (4xx) and not a visitor abort.
 */
export function isProviderFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: unknown; statusCode?: unknown; name?: unknown; message?: unknown };
  const status = typeof e.status === 'number' ? e.status : typeof e.statusCode === 'number' ? e.statusCode : null;
  if (status !== null) return status >= 500 || status === 429;
  const name = typeof e.name === 'string' ? e.name : '';
  if (name === 'AbortError') return false;
  if (/^(APIConnectionError|APIConnectionTimeoutError|APITimeoutError|InternalServerError|ConnectTimeoutError)$/.test(name)) return true;
  return name === 'TypeError' && e.message === 'fetch failed';
}

/** A JSON 429/503 for a refused call. The body names no amounts (they can be internal figures). */
export function spendCapResponse(d: AiSpendDecision, message?: string): Response {
  const capped = d.status === 429;
  return new Response(JSON.stringify({
    error: message ?? (capped
      ? 'The AI Assistant has reached its usage limit for now. Please try again later.'
      : 'The AI Assistant is temporarily unavailable. Please try again shortly.'),
    code: capped ? 'ai_spend_capped' : 'ai_unavailable',
  }), {
    status: d.status === 200 ? 503 : d.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': String(Math.max(1, d.retryAfterSeconds)) },
  });
}

export function __resetAiSpendCapForTests(): void {
  lastStoreWarn = 0;
}
