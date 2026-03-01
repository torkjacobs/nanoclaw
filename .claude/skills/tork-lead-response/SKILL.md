# Tork Lead Response

Host-level sales response drafting using the Claude API. Paste an inbound lead message and get a professional reply draft. Supports iterative adjustment with separate conversation history from the content drafter.

## Commands

| Command | Example |
|---------|---------|
| `@tork reply [message]` | `@tork reply Hi, we're a fintech company looking for AI governance. What does Tork offer?` |
| `@tork adjust [feedback]` | `@tork adjust mention SOC 2 compliance and make it shorter` |

## How It Works

1. User pastes an inbound message after `@tork reply`
2. Calls Claude API with a sales-focused system prompt containing Tork pricing, features, and response rules
3. Returns a formatted draft response
4. `@tork adjust` appends feedback to the conversation and re-calls the API for iterative editing
5. Conversation history is stored per group (separate from `@tork draft`/`@tork refine`)

## Output Format

```
💼 Lead Response Draft
---
[generated reply]
---
Reply '@tork adjust [feedback]' to refine
```

Adjustment:
```
💼 Adjusted Lead Response
---
[updated reply]
---
Reply '@tork adjust [feedback]' to refine further
```

## System Prompt Details

The sales response system prompt includes:
- Full Tork feature set (PII detection, compliance receipts, 79+ frameworks, 11 SDKs)
- Pricing tiers (Free 5K calls through Enterprise $2,500/mo)
- Response rules: warm, professional, under 200 words, no overselling
- Industry-specific compliance framework references when relevant
- Clear next-step CTAs (demo, free tier, etc.)

## Authentication

Uses `ANTHROPIC_API_KEY` from `.env` with `x-api-key` header.

## Files

| File | Purpose |
|------|---------|
| `src/tork-leads.ts` | API calls, reply/adjust handlers, per-group state |
| `src/index.ts` | Message loop intercept |
