import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  aiSpendKeys,
  capChargeUsd,
  toMicroUsd,
  __resetAiSpendCapForTests,
} from './ai-spend-cap.js';
import { SpendCapError, spendGuardedFetch } from './anthropic-spend.js';
import { FakeUpstash } from './fake-upstash.test-helper.js';

const URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

function makeInit(): RequestInit {
  return {
    method: 'POST',
    headers: { 'x-api-key': 'test-key-not-real' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system: 's',
      messages: [{ role: 'user', content: 'hi' }],
    }),
  };
}

function okResponse(): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: 'text', text: 'hello' }],
      usage: { input_tokens: 100, output_tokens: 200 },
    }),
    { status: 200 },
  );
}

describe('spendGuardedFetch', () => {
  let redis: FakeUpstash;
  let logs: string[];
  const envOn = (extra: Record<string, string> = {}) => ({
    AI_SPEND_CAPS: 'on',
    UPSTASH_REDIS_REST_URL: 'https://fake.upstash.test',
    UPSTASH_REDIS_REST_TOKEN: 'fake-token',
    ...extra,
  });
  const opts = (
    env: Record<string, string | undefined>,
    providerFetch: typeof fetch,
  ) => ({
    env,
    now: redis.now,
    fetch: redis.fetch,
    providerFetch,
    log: (line: string) => {
      logs.push(line);
    },
  });

  beforeEach(() => {
    redis = new FakeUpstash();
    logs = [];
    __resetAiSpendCapForTests();
  });

  it('switch off: calls the provider once with identical url/init and makes no store call', async () => {
    const response = okResponse();
    const provider = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => response,
    );
    const init = makeInit();

    const got = await spendGuardedFetch(
      'test',
      URL,
      init,
      opts(
        {
          UPSTASH_REDIS_REST_URL: 'https://fake.upstash.test',
          UPSTASH_REDIS_REST_TOKEN: 't',
        },
        provider as unknown as typeof fetch,
      ),
    );

    expect(got).toBe(response);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0][0]).toBe(URL);
    expect(provider.mock.calls[0][1]).toBe(init);
    expect(redis.calls).toBe(0);
    expect(logs).toEqual([]);
  });

  it('switch explicitly off: still a pure pass-through', async () => {
    const provider = vi.fn(async () => okResponse());
    await spendGuardedFetch(
      'test',
      URL,
      makeInit(),
      opts({ AI_SPEND_CAPS: 'off' }, provider as unknown as typeof fetch),
    );
    expect(provider).toHaveBeenCalledTimes(1);
    expect(redis.calls).toBe(0);
  });

  it('switch on, under cap: calls the provider, records spend on the hour key, returns the response untouched', async () => {
    const provider = vi.fn(async () => okResponse());
    const env = envOn();

    const got = await spendGuardedFetch(
      'drafter',
      URL,
      makeInit(),
      opts(env, provider as unknown as typeof fetch),
    );

    expect(provider).toHaveBeenCalledTimes(1);
    expect(got.status).toBe(200);
    const body = (await got.json()) as { content: Array<{ text: string }> };
    expect(body.content[0].text).toBe('hello');

    const expected = toMicroUsd(
      capChargeUsd(null, { model: MODEL, tokensIn: 100, tokensOut: 200 }),
    );
    expect(expected).toBeGreaterThan(0);
    const keys = aiSpendKeys('nanoclaw', redis.now, env);
    expect(Number(redis.run(['GET', keys.hour]))).toBe(expected);
    expect(Number(redis.run(['GET', keys.day]))).toBe(expected);

    const events = logs.map(
      (l) =>
        JSON.parse(l) as { event: string; feature?: string; model?: string },
    );
    expect(
      events.some(
        (e) =>
          e.event === 'ai_spend_call' &&
          e.feature === 'drafter' &&
          e.model === MODEL,
      ),
    ).toBe(true);
  });

  it('switch on, over cap: throws SpendCapError 429 and never calls the provider', async () => {
    const provider = vi.fn(async () => okResponse());
    const env = envOn({ AI_SPEND_HOURLY_USD: '0.0001' });

    const err = await spendGuardedFetch(
      'leads',
      URL,
      makeInit(),
      opts(env, provider as unknown as typeof fetch),
    ).catch((e) => e);

    expect(err).toBeInstanceOf(SpendCapError);
    expect((err as SpendCapError).status).toBe(429);
    expect((err as SpendCapError).kind).toBe('spend_cap');
    expect(provider).not.toHaveBeenCalled();
  });

  it('switch on, store unreachable: throws SpendCapError 503 and never calls the provider', async () => {
    const provider = vi.fn(async () => okResponse());
    redis.failing = true;

    const err = await spendGuardedFetch(
      'marketing',
      URL,
      makeInit(),
      opts(envOn(), provider as unknown as typeof fetch),
    ).catch((e) => e);

    expect(err).toBeInstanceOf(SpendCapError);
    expect((err as SpendCapError).status).toBe(503);
    expect((err as SpendCapError).kind).toBe('spend_unavailable');
    expect(provider).not.toHaveBeenCalled();
  });

  it('provider 529 counts a failure: breaker opens, next call is refused 503 without a provider call', async () => {
    const provider = vi.fn(
      async () => new Response('overloaded', { status: 529 }),
    );
    const env = envOn({ AI_BREAKER_FAILURES: '1' });

    const first = await spendGuardedFetch(
      'marketing-content',
      URL,
      makeInit(),
      opts(env, provider as unknown as typeof fetch),
    );
    expect(first.status).toBe(529);
    expect(provider).toHaveBeenCalledTimes(1);

    const err = await spendGuardedFetch(
      'marketing-content',
      URL,
      makeInit(),
      opts(env, provider as unknown as typeof fetch),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(SpendCapError);
    expect((err as SpendCapError).status).toBe(503);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('provider fetch throwing counts a failure and rethrows the original error', async () => {
    const boom = new TypeError('fetch failed');
    const provider = vi.fn(async () => {
      throw boom;
    });
    const env = envOn({ AI_BREAKER_FAILURES: '1' });

    await expect(
      spendGuardedFetch(
        'x',
        URL,
        makeInit(),
        opts(env, provider as unknown as typeof fetch),
      ),
    ).rejects.toBe(boom);
    const err = await spendGuardedFetch(
      'x',
      URL,
      makeInit(),
      opts(env, provider as unknown as typeof fetch),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(SpendCapError);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('recording failure never throws into the caller', async () => {
    const provider = vi.fn(async () => {
      redis.failing = true; // store goes down after the check, before the record
      return okResponse();
    });

    const got = await spendGuardedFetch(
      'x',
      URL,
      makeInit(),
      opts(envOn(), provider as unknown as typeof fetch),
    );
    expect(got.status).toBe(200);
  });
});
