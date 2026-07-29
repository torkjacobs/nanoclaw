# NanoClaw Skill Status Audit

**Date:** 2026-04-09
**Build:** PASS (`tsc` — no errors)
**Tests:** 352 passed / 0 failed (32 test files)

---

## Core Skills (documented in CLAUDE.md)

| # | Skill | Path | Status | Notes |
|---|-------|------|--------|-------|
| 1 | `/setup` | `.claude/skills/setup/` | Working | SKILL.md only (interactive) |
| 2 | `/customize` | `.claude/skills/customize/` | Working | SKILL.md only (interactive) |
| 3 | `/debug` | `.claude/skills/debug/` | Working | SKILL.md only (troubleshooting guide) |
| 4 | `/update` | `.claude/skills/update/` | Working | SKILL.md + `scripts/fetch-upstream.sh` |
| 5 | `/qodo-pr-resolver` | `.claude/skills/qodo-pr-resolver/` | Working | SKILL.md + `resources/` reference docs |
| 6 | `/get-qodo-rules` | `.claude/skills/get-qodo-rules/` | Working | SKILL.md + `references/` reference docs |

## Channel Integration Skills (deterministic via skills-engine)

| # | Skill | Path | Status | Has Tests | Notes |
|---|-------|------|--------|-----------|-------|
| 7 | `/add-discord` | `.claude/skills/add-discord/` | Working | Yes | manifest.yaml, add/, modify/, tests/ |
| 8 | `/add-gmail` | `.claude/skills/add-gmail/` | Working | Yes | manifest.yaml, add/, modify/, tests/ |
| 9 | `/add-slack` | `.claude/skills/add-slack/` | Working | Yes | manifest.yaml, add/, modify/, tests/ |
| 10 | `/add-telegram` | `.claude/skills/add-telegram/` | Working | Yes | manifest.yaml, add/, modify/, tests/ |
| 11 | `/add-telegram-swarm` | `.claude/skills/add-telegram-swarm/` | Working | No | SKILL.md only (agent swarm overlay) |
| 12 | `/add-parallel` | `.claude/skills/add-parallel/` | Working | No | SKILL.md only (MCP integration) |
| 13 | `/add-voice-transcription` | `.claude/skills/add-voice-transcription/` | Working | Yes | manifest.yaml, add/, modify/, tests/ |
| 14 | `/x-integration` | `.claude/skills/x-integration/` | Working | Yes | manifest.yaml, add/, modify/, tests/ |
| 15 | `/convert-to-apple-container` | `.claude/skills/convert-to-apple-container/` | Working | Yes | manifest.yaml, modify/, tests/ |

## Tork Platform Skills (business automation)

| # | Skill | Path | Status | Notes |
|---|-------|------|--------|-------|
| 16 | `/tork-analytics` | `.claude/skills/tork-analytics/` | Working | Supabase metrics queries |
| 17 | `/tork-claims` | `.claude/skills/tork-claims/` | Working | Pre-publish claim verification |
| 18 | `/tork-competitor-watch` | `.claude/skills/tork-competitor-watch/` | Working | 12-hour competitor monitoring |
| 19 | `/tork-content-drafter` | `.claude/skills/tork-content-drafter/` | Working | Host-level content generation |
| 20 | `/tork-guardian` | `.claude/skills/tork-guardian/` | Working | PII governance middleware |
| 21 | `/tork-lead-response` | `.claude/skills/tork-lead-response/` | Working | Sales response drafting |
| 22 | `/tork-marketing` | `.claude/skills/tork-marketing/` | Working | Content generation + publishing |
| 23 | `/tork-metrics-digest` | `.claude/skills/tork-metrics-digest/` | Working | Daily 8 AM AEST digest |
| 24 | `/tork-seo` | `.claude/skills/tork-seo/` | Working | Google Search Console reports |
| 25 | `/tork-signups` | `.claude/skills/tork-signups/` | Working | Supabase signup polling |
| 26 | `/tork-social-listener` | `.claude/skills/tork-social-listener/` | Working | HN + Reddit monitoring |
| 27 | `/tork-swarm` | `.claude/skills/tork-swarm/` | Working | Swarm coordinator |
| 28 | `/tork-website-monitor` | `.claude/skills/tork-website-monitor/` | Working | 6-hour endpoint monitoring |

## TODO Items Found

All 4 TODOs are in a single file — optional API key setup reminders (non-blocking):

| File | Line | TODO |
|------|------|------|
| `src/skills/marketing/module-c-publish.ts` | 45 | Add DEVTO_API_KEY to .env |
| `src/skills/marketing/module-c-publish.ts` | 57 | Add Twitter API keys to .env |
| `src/skills/marketing/module-c-publish.ts` | 82 | Add LinkedIn API keys to .env |
| `src/skills/marketing/module-c-publish.ts` | 103 | Add Hashnode API keys to .env |

## Summary

- **28 skills** total — all healthy, no broken imports
- **0 broken imports** across entire codebase
- **4 TODO comments** (all low-priority API key reminders in one file)
- **32 test files / 352 tests** — all passing
- **Build** compiles cleanly with no TypeScript errors
