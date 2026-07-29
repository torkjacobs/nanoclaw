# Tork SEO Tracker (Skill 11)

Google Search Console integration for weekly SEO performance reports.

## Setup

1. Add GSC_CLIENT_ID and GSC_CLIENT_SECRET to .env (from Google Cloud Console)
2. Run `node scripts/gsc-oauth.js` to authorize and get tokens
3. Restart NanoClaw

## Commands

- `@tork seo` / `@tork gsc` — on-demand SEO report
- Weekly report auto-sends every Monday 9:00 AM AEST

## Report Contents

- Top 10 search queries (clicks, position)
- 7-day totals (clicks, impressions, CTR, avg position)
- Week-over-week comparison
- Sitemap status

## Files

- `scripts/gsc-oauth.js` — OAuth token helper
- `src/tork-seo.ts` — GSC API client, report formatting, timer
- `src/env.ts` — `updateEnvVar()` for token refresh persistence

## Token Refresh

Access tokens auto-refresh via refresh_token when API returns 401.
New access token is persisted to .env automatically.
