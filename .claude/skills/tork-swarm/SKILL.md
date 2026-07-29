# Skill 16: Swarm Coordinator

Connects existing NanoClaw skills so they trigger each other automatically. All generated content goes through the approval queue — nothing is published without `@tork approve`.

## Trigger Chains

| # | Trigger | Action | Status |
|---|---------|--------|--------|
| 1 | Competitor change | Auto-draft LinkedIn + Twitter response | Stub (not wired) |
| 2 | Dev.to article published | Auto-draft promo tweet | Active |
| 3 | Directory submitted (`@tork submit done`) | Auto-draft announcement tweet | Active |
| 4 | Social mention found | Auto-draft engagement comment | Active |
| 5 | Analytics milestone (user/download thresholds) | Auto-draft celebration tweet | Active |
| 6 | X thread published | Auto-draft LinkedIn cross-promo | Active |

## Milestone Thresholds

Users and downloads: 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000.
Momentum trigger: >3 new signups in a single day.
Milestones are tracked in `store/swarm-milestones.json` so each threshold fires only once.

## Rate Limiting

Maximum 3 swarm auto-drafts per hour. Excess drafts are logged and silently skipped.

## Architecture

- `src/tork-swarm.ts` — coordinator logic, rate limiter, milestone tracking
- Initialized from `src/index.ts` via `initSwarm()` with content generation and messaging callbacks
- No circular imports: skill modules import swarm hooks (one direction), swarm receives `handleContentGeneration` via init

## Integration Points

| Module | Hook |
|--------|------|
| `tork-marketing.ts` | `publishToDevto` → `onArticlePublished` |
| `tork-marketing.ts` | `handleSubmitDone` → `onDirectorySubmitted` |
| `tork-marketing.ts` | `publishThread` → `onThreadPublished` |
| `tork-social.ts` | `runSocialCheck` → `onSocialMention` |
| `tork-analytics.ts` | `handleAnalyticsCommand` → `onAnalyticsReport` |

## Files

- `src/tork-swarm.ts` — implementation
- `store/swarm-milestones.json` — milestone tracking (auto-created)
