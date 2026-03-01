# Tork Social Listener

Host-level social media monitoring that searches Hacker News and Reddit for mentions of Tork Network every 4 hours. Posts alerts to the main group only when new mentions are found.

## Sources

| Source | Search Query |
|--------|-------------|
| Hacker News (Algolia API) | `tork network ai`, `tork governance ai` — stories from last 12h |
| Reddit (search.json) | `tork network ai governance` — new posts, last day, limit 10 |

## Commands

| Command | Description |
|---------|-------------|
| `@tork mentions` | Show all mentions from the last 48 hours |
| `@tork social` | Alias for mentions |

## How It Works

1. Every 4 hours, queries HN Algolia API and Reddit search API
2. Extracts title, URL, author, timestamp, and source from JSON responses
3. Compares against seen URLs stored in `store/social-mentions.json`
4. Posts alert only when new (unseen) mentions are found
5. Old entries (>7 days) are pruned automatically
6. On-demand `@tork mentions` shows all mentions from the last 48 hours

## Alert Format

```
📡 Tork Social Mentions — 3 new

🟠 Hacker News:
• AI Governance Platform Tork Hits 1ms PII Detection — by pg (2h ago)
  https://news.ycombinator.com/item?id=12345

🔵 Reddit:
• Has anyone tried Tork Network for compliance? — r/artificial (4h ago)
  https://reddit.com/r/artificial/comments/abc123
```

## On-Demand Format

```
📡 Tork Social Mentions — Last 48h (5 total)

🟠 Hacker News:
• [Title] — by [author] ([time ago])
  [url]

🔵 Reddit:
• [Title] — r/[subreddit] ([time ago])
  [url]

4:18 pm AEST
```

## Configuration

- 15-second timeout per API request
- First check runs 90 seconds after startup
- Seen URLs persist in `store/social-mentions.json` (auto-pruned after 7 days)
- HN lookback: 12 hours per check
- Reddit lookback: 1 day per check
- On-demand window: 48 hours

## Files

| File | Purpose |
|------|---------|
| `src/tork-social.ts` | API queries, dedup, alert formatting, timer |
| `src/index.ts` | Message loop intercept and timer startup |
| `store/social-mentions.json` | Persisted seen URLs (auto-created) |
