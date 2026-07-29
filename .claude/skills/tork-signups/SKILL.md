# Skill 10: Signup Notifier

Polls the Supabase `profiles` table every 60 seconds for new rows and sends an instant WhatsApp notification when someone signs up for Tork.

## Commands

- `@tork signups` — check notifier status (polling state, last check time, tracked count)

## Behavior

- Polls every 60 seconds (first poll 30s after startup)
- On first run, saves the latest `created_at` as baseline without alerting
- Subsequent polls compare against last seen timestamp to find new signups
- Each new signup triggers an instant WhatsApp message with email, timestamp, and total user count
- After detecting new signups, triggers the Swarm coordinator to check for user milestones

## Notification Format

```
🆕 New Tork Signup!

📧 user@example.com
🕐 Thu 5 Mar, 10:30 am
👥 Total users: 142

Welcome them? → @tork content email welcome to user@example.com
```

## Data Sources

Supabase REST API using `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from `.env`.

| Query | Endpoint |
|-------|----------|
| Recent profiles | `profiles?select=id,email,created_at&order=created_at.desc&limit=5` |
| Total count | `profiles?select=id&limit=1` with `Prefer: count=exact` |

## State

- `store/signup-last-seen.json` — tracks `lastSeenAt` timestamp, `trackedCount`, and `lastCheckTime`

## Env Vars

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Supabase service role key

## Files

- `src/tork-signups.ts` — implementation
- `src/index.ts` — integration (command intercept + timer registration)
