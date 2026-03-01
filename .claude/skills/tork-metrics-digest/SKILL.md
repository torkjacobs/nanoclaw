# Tork Metrics Digest

Host-level daily digest posted at 8 AM AEST to the main group. Includes health check results, day count since launch (Feb 24, 2026), and optional metrics from the Tork API.

## Commands

| Command | Example |
|---------|---------|
| `@tork digest` | On-demand digest |
| `@tork morning` | Alias for digest |

## Scheduled

Runs automatically at 8:00 AM AEST every day. Timer calculates ms until next 8 AM AEST, then reschedules after each run.

## Output Format

```
📊 Tork Daily Digest — Day [X] since launch

Status: ✅ All systems operational

• tork.network: ✅ 230ms
• API /govern: ✅ 180ms
• demo.tork.network: ✅ 340ms
• innovation.tork.network: ✅ 290ms

8:00 am AEST
```

If `TORK_API_KEY` is set in `.env`, a Metrics section is appended with data from `GET /api/v1/admin/metrics`.

## Configuration

| Env Variable | Purpose |
|-------------|---------|
| `TORK_API_KEY` | (Optional) API key for Tork metrics endpoint |

## Files

| File | Purpose |
|------|---------|
| `src/tork-digest.ts` | Digest logic, timer, metrics fetch, formatting |
| `src/index.ts` | Message loop intercept and timer startup |
