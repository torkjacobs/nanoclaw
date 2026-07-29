# Tork Marketing Engine (Skill 8)

Host-level skill for directory submissions, content generation with approval queue, and auto-publishing. Tracks 30+ AI/startup directories with pre-filled submission copy, generates platform-specific content via Claude API, and publishes to Dev.to.

## Commands

### Directory Submissions

| Command | Example | Description |
|---------|---------|-------------|
| `@tork directories` | `@tork directories` | Dashboard: live/submitted/pending/deferred counts with names |
| `@tork marketing` | `@tork marketing` | Alias for `@tork directories` |
| `@tork submit [name]` | `@tork submit BetaList` | Pre-filled copy for a directory (fuzzy matched) with submission URL |
| `@tork submit next` | `@tork submit next` | Copy for the first pending directory |
| `@tork submit done [name]` | `@tork submit done BetaList` | Mark as submitted, persists to store/marketing-status.json |

### Content Generation

| Command | Example | Description |
|---------|---------|-------------|
| `@tork content [platform] [topic]` | `@tork content linkedin PII detection` | Generate platform-specific content about a topic |
| `@tork content comment [topic]` | `@tork content comment AI agent security` | Discussion comment (50-150 words) |
| `@tork content guestpost [publication + topic]` | `@tork content guestpost TechCrunch AI governance` | Guest post pitch email |
| `@tork content answer [question]` | `@tork content answer How to detect PII in LLM outputs` | Stack Overflow / Quora answer |
| `@tork content bookpromo [topic]` | `@tork content bookpromo free AI governance ebook` | Book promo content for The Agent Crisis |
| `@tork content bookdrip [1-4]` | `@tork content bookdrip 1` | Book download drip email (Day 0/3/7/14) |

### Approval Queue

| Command | Example | Description |
|---------|---------|-------------|
| `@tork refine [feedback]` | `@tork refine make it shorter and punchier` | Revise last draft with feedback |
| `@tork approve` | `@tork approve` | Approve last draft; auto-publishes if platform has API key |
| `@tork approve [id]` | `@tork approve D-001` | Approve specific draft by ID |
| `@tork queue` | `@tork queue` | List all draft/approved items |
| `@tork published` | `@tork published` | List all published items with URLs |

## Content Platforms

| Platform | ID Prefix | Style |
|----------|-----------|-------|
| `linkedin` | L | Professional thought leadership, 1200-1500 chars, hashtags, CTA |
| `twitter` | T | Punchy tweet, under 280 chars |
| `devto` | D | Technical tutorial, 800-1500 words, markdown with frontmatter |
| `reddit` | R | Educational, 200-400 words, value-first |
| `hackernews` | H | Show HN format, 100% technical |
| `blog` | B | Full blog post, 600-1200 words, SEO optimized |
| `email` | E | Professional outreach, under 200 words |
| `comment` | C | Thoughtful discussion comment, 50-150 words |
| `guestpost` | G | Guest post pitch to editors, under 200 words |
| `answer` | A | Stack Overflow / Quora answer, solution-first |
| `bookpromo` | BP | Book promo for The Agent Crisis, proud but not pushy |
| `bookdrip` | BD | Book download drip email sequence (4 emails) |

## Auto-Publishing

| Platform | Status | Env Var |
|----------|--------|---------|
| Dev.to | Active | `DEVTO_API_KEY` |
| Twitter | Placeholder | `TWITTER_API_KEY` |
| LinkedIn | Placeholder | `LINKEDIN_API_KEY` |
| Hashnode | Placeholder | `HASHNODE_API_KEY` |

When approving a draft, if the platform has a configured API key, content is published automatically. Otherwise, a copy/paste message is returned.

## Directory Statuses

- **live** -- Listed and visible on the directory
- **submitted** -- Submission sent, awaiting approval
- **pending** -- Ready to submit, pre-filled copy available
- **deferred** -- Skipped (e.g. paid submission)

## Persistence

- Directory status overrides: `store/marketing-status.json`
- Content queue: in-memory (resets on restart)

## Files

| File | Purpose |
|------|---------|
| `src/tork-marketing.ts` | Full implementation: directories, content queue, publishers |
| `src/index.ts` | Message loop intercept (host command routing) |
| `store/marketing-status.json` | Persisted directory status overrides |
