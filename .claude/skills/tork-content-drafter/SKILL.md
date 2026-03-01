# Tork Content Drafter

Host-level content generation using the Claude API directly (no container overhead). Generates marketing content for Tork Network — LinkedIn posts, tweets, blog intros, and more — and supports iterative refinement.

## Commands

| Command | Example |
|---------|---------|
| `@tork draft [description]` | `@tork draft a LinkedIn post about our PII detection achieving 1ms processing time` |
| `@tork refine [feedback]` | `@tork refine make it more technical and mention the 79 frameworks` |

## Content Types

Auto-detected from the description:

| Keyword | Type |
|---------|------|
| tweet, twitter, x post | Tweet (< 280 chars) |
| linkedin | LinkedIn Post (no emojis, CTA to tork.network) |
| blog | Blog Post |
| email | Email |
| thread | Thread |
| (default) | LinkedIn Post |

## How It Works

1. Message intercepted in the message loop before container dispatch (same pattern as health check)
2. Calls Claude API directly via `fetch()` using the OAuth token or API key from `.env`
3. Stores the draft and conversation history per group JID in memory
4. `@tork refine` appends feedback to the conversation and re-calls the API for iterative editing

## System Prompt

The drafter uses a fixed system prompt that establishes Tork Network brand voice:
- Professional but approachable
- Technically credible, not hype
- No emojis in LinkedIn posts
- Tweets under 280 characters
- LinkedIn posts end with subtle CTA to tork.network

## Output Format

```
✏️ Draft — LinkedIn Post
---
[generated content]
---
Reply '@tork refine [feedback]' to adjust
```

Refinement:
```
✏️ Refined Draft — LinkedIn Post
---
[updated content]
---
Reply '@tork refine [feedback]' to adjust further
```

## Authentication

Uses the same credentials as the container agents:
- `CLAUDE_CODE_OAUTH_TOKEN` (OAuth Bearer auth) — preferred
- `ANTHROPIC_API_KEY` (x-api-key auth) — fallback

## Files

| File | Purpose |
|------|---------|
| `src/tork-drafter.ts` | API calls, content type detection, draft/refine handlers, state |
| `src/index.ts` | Message loop intercept (unified with health check) |
