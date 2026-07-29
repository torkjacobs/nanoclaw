# Skill 9: Analytics Reporter

Queries Supabase directly via REST API for Tork platform metrics and delivers them to WhatsApp.

## Commands

- `@tork metrics` — on-demand analytics report
- `@tork stats` — alias
- `@tork analytics` — alias

## Schedule

Daily at 8:05 AM AEST (5 minutes after the morning digest).

## Data Sources

All queries go to Supabase REST API using `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from `.env`.

| Metric | Table | Filter |
|--------|-------|--------|
| Total users | `profiles` | — |
| New users today | `profiles` | `created_at >= today` |
| New users this week | `profiles` | `created_at >= monday` |
| Total API keys | `api_keys` | — |
| Active API keys (7d) | `api_keys` | `last_used_at >= monday` |
| Total book downloads | `book_downloads` | — |
| Downloads today | `book_downloads` | `created_at >= today` |

Uses `Prefer: count=exact` header and parses the `content-range` response header for counts.

## Env Vars

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Supabase service role key (Dashboard → Settings → API)

## Files

- `src/tork-analytics.ts` — implementation
- `src/index.ts` — integration (command intercept + timer registration)
