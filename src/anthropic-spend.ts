/**
 * Spend-capped wrapper for NanoClaw's direct Anthropic API calls (NC-04).
 *
 * Every direct paid call goes through spendGuardedFetch(). With AI_SPEND_CAPS unset or off it is
 * exactly `fetch(url, init)`: same request, same response, no store call, no log line. With the
 * switch on it checks the tenant ("nanoclaw") budget before the call, records the spend after,
 * and counts provider failures towards the circuit breaker. See ai-spend-cap.ts for the rules.
 */

import {
  aiSpendCapsEnabled,
  capChargeUsd,
  ceilingUsd,
  checkSpend,
  recordProviderFailure,
  recordSpend,
  type AiSpendOptions,
} from './ai-spend-cap.js';

const TENANT = 'nanoclaw';
const PRODUCT = 'nanoclaw';
const FAILURE_STATUSES = new Set([429, 500, 502, 503, 504, 529]);

export type SpendCapErrorKind = 'spend_cap' | 'spend_unavailable';

/** Thrown instead of calling the provider when a spend cap or the breaker refuses the call. */
export class SpendCapError extends Error {
  readonly status: 429 | 503;
  readonly kind: SpendCapErrorKind;

  constructor(status: 429 | 503, reason: string) {
    super(
      status === 429
        ? `AI spend cap reached (${reason}); the call was not made. Try again later.`
        : `AI spend guard unavailable (${reason}); the call was not made. Try again shortly.`,
    );
    this.name = 'SpendCapError';
    this.status = status;
    this.kind = status === 429 ? 'spend_cap' : 'spend_unavailable';
  }
}

export interface SpendGuardOptions extends AiSpendOptions {
  /** Test seam: the provider fetch. Defaults to the global fetch (never opts.fetch, which is the store's). */
  providerFetch?: typeof fetch;
}

function storeOptions(opts: SpendGuardOptions): AiSpendOptions {
  const { providerFetch: _providerFetch, ...rest } = opts;
  return { ...rest, product: PRODUCT };
}

function describeBody(init: RequestInit): { model: string | undefined; maxTokens: number | null; tokensIn: number } {
  const raw = typeof init.body === 'string' ? init.body : '';
  let model: string | undefined;
  let maxTokens: number | null = null;
  try {
    const parsed = JSON.parse(raw) as { model?: unknown; max_tokens?: unknown };
    if (typeof parsed.model === 'string') model = parsed.model;
    if (typeof parsed.max_tokens === 'number' && Number.isFinite(parsed.max_tokens)) maxTokens = parsed.max_tokens;
  } catch {
    /* unparseable body: priced as an unknown model with whatever is known */
  }
  return { model, maxTokens, tokensIn: Math.ceil(raw.length / 4) };
}

function logLine(o: AiSpendOptions, payload: Record<string, unknown>): void {
  try {
    const line = JSON.stringify({ ...payload, product: PRODUCT, ts: new Date(o.now ?? Date.now()).toISOString() });
    if (o.log) o.log(line, 'info');
    else console.info(line);
  } catch {
    /* logging never breaks a call */
  }
}

async function usageOf(response: Response): Promise<{ input: number | null; output: number | null }> {
  try {
    const data = (await response.clone().json()) as { usage?: { input_tokens?: unknown; output_tokens?: unknown } };
    const input = data?.usage?.input_tokens;
    const output = data?.usage?.output_tokens;
    return {
      input: typeof input === 'number' && Number.isFinite(input) ? input : null,
      output: typeof output === 'number' && Number.isFinite(output) ? output : null,
    };
  } catch {
    return { input: null, output: null };
  }
}

async function noteFailure(o: AiSpendOptions): Promise<void> {
  try {
    await recordProviderFailure(TENANT, o);
  } catch {
    /* recording never throws into the caller */
  }
}

/**
 * Drop-in for `fetch(url, init)` on a paid Anthropic call. `feature` names the caller in the
 * `ai_spend_call` log line. Throws SpendCapError (without calling the provider) when refused.
 */
export async function spendGuardedFetch(
  feature: string,
  url: string,
  init: RequestInit,
  opts: SpendGuardOptions = {},
): Promise<Response> {
  const doFetch = opts.providerFetch ?? fetch;
  if (!aiSpendCapsEnabled(opts.env)) return doFetch(url, init);

  const o = storeOptions(opts);
  const { model, maxTokens, tokensIn } = describeBody(init);
  const estUsd = ceilingUsd({ model, tokensIn, tokensOut: maxTokens });

  const decision = await checkSpend(TENANT, estUsd, o);
  if (!decision.allowed) {
    throw new SpendCapError(decision.status === 429 ? 429 : 503, decision.reason);
  }

  logLine(o, { event: 'ai_spend_call', feature, model: model ?? null });

  let response: Response;
  try {
    response = await doFetch(url, init);
  } catch (err) {
    await noteFailure(o);
    throw err;
  }

  if (FAILURE_STATUSES.has(response.status)) {
    await noteFailure(o);
    return response;
  }

  if (response.ok) {
    try {
      const usage = await usageOf(response);
      const usd = capChargeUsd(null, {
        model,
        tokensIn: usage.input ?? tokensIn,
        tokensOut: usage.output ?? maxTokens,
      });
      await recordSpend(TENANT, usd, o);
    } catch {
      /* recording never throws into the caller: the money is already spent */
    }
  }
  return response;
}
