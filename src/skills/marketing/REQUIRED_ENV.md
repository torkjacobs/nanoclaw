# Skill 8: Marketing Engine — Required Environment Variables

## All Set (in .env)

| Variable | Module | Status |
|----------|--------|--------|
| `ANTHROPIC_API_KEY` | B (Content Generation) | Set |
| `DEVTO_API_KEY` | C (Auto-Publish) | Set |
| `TWITTER_API_KEY` | C (Auto-Publish) | Set |
| `TWITTER_API_SECRET` | C (Auto-Publish) | Set |
| `TWITTER_ACCESS_TOKEN` | C (Auto-Publish) | Set |
| `TWITTER_ACCESS_SECRET` | C (Auto-Publish) | Set |
| `TWITTER_BEARER_TOKEN` | C (Auto-Publish) | Set |
| `HASHNODE_TOKEN` | C (Auto-Publish) | Set |
| `HASHNODE_PUBLICATION_ID` | C (Auto-Publish) | Set |
| `LINKEDIN_CLIENT_ID` | C (Auto-Publish) | Set |
| `LINKEDIN_CLIENT_SECRET` | C (Auto-Publish) | Set |
| `LINKEDIN_ACCESS_TOKEN` | C (Auto-Publish) | Set |
| `LINKEDIN_PERSON_ID` | C (Auto-Publish) | Set |

## Module Breakdown

### Module A: Directory Submission Templates
- No API keys required — templates are static data with manual submission workflow.

### Module B: Content Generation + Approval Queue
- `ANTHROPIC_API_KEY` — Required for Claude API calls. Uses claude-haiku-4-5 for drafts (cheap), claude-sonnet-4-6 for approved rewrites (quality).

### Module C: Auto-Publish Connectors
- **Dev.to**: `DEVTO_API_KEY` — POST https://dev.to/api/articles
- **X/Twitter**: `TWITTER_API_KEY` + `TWITTER_API_SECRET` + `TWITTER_ACCESS_TOKEN` + `TWITTER_ACCESS_SECRET` — OAuth 1.0a for Twitter API v2
- **LinkedIn**: `LINKEDIN_ACCESS_TOKEN` + `LINKEDIN_PERSON_ID` — Bearer token + person URN for LinkedIn REST API
- **Hashnode**: `HASHNODE_TOKEN` + `HASHNODE_PUBLICATION_ID` — GraphQL API at gql.hashnode.com

## AI Spend Caps (optional, OFF by default)

Every direct Anthropic API call in NanoClaw (drafter, leads, marketing, marketing content, marketing publish extras) goes through `src/anthropic-spend.ts`. With the switch off, behaviour is exactly the plain `fetch` it replaced: no store calls, no extra logging.

| Variable | Purpose | Default |
|----------|---------|---------|
| `AI_SPEND_CAPS` | Master switch. `on` (or `1` / `true`) enables caps; anything else is off. | off |
| `UPSTASH_REDIS_REST_URL` | Upstash REST store for spend counters (falls back to `KV_REST_API_URL`). | unset |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token (falls back to `KV_REST_API_TOKEN`). | unset |
| `AI_SPEND_HOURLY_USD` | Hourly cap in USD for tenant `nanoclaw` (a Redis `caps` hash entry overrides it). | 5 |
| `AI_SPEND_DAILY_USD` | Daily cap in USD (UTC day). | 50 |
| `AI_BREAKER_FAILURES` | Consecutive provider failures before the breaker opens. | 5 |
| `AI_BREAKER_COOLDOWN_S` | Seconds the breaker refuses before one probe call is allowed. | 60 |
| `AI_SPEND_NAMESPACE` | Optional key namespace (separates staging from production on one store). | none |

Notes:
- These are read from the process environment (`process.env`, e.g. the launchd plist), not from `.env` via `readEnvFile`.
- Fail-closed: with the switch on, an unconfigured or unreachable store refuses the call (503) rather than letting spend run uncapped. Emergency override: `AI_SPEND_CAPS=off`.
- A refused call throws `SpendCapError` (status 429 cap reached, 503 guard unavailable); callers catch it and reply with the error text instead of crashing.
