# Skill 8: Marketing Engine — Required Environment Variables

## All Set (in .env)

| Variable | Module | Status |
|----------|--------|--------|
| `ANTHROPIC_API_KEY` | B (Content Generation) | Set |
| `DEVTO_API_KEY` | C (Auto-Publish) | Set |
| `TWITTER_API_KEY` | C (Auto-Publish) | Set |
| `TWITTER_API_SECRET` | C (Auto-Publish) | Set |
| `TWITTER_ACCESS_TOKEN` | C (Auto-Publish) | Set |
| `TWITTER_ACCESS_SECRET` | C (Auto-Publish) | Set |
| `TWITTER_BEARER_TOKEN` | C (Auto-Publish) | Set |
| `HASHNODE_TOKEN` | C (Auto-Publish) | Set |
| `HASHNODE_PUBLICATION_ID` | C (Auto-Publish) | Set |
| `LINKEDIN_CLIENT_ID` | C (Auto-Publish) | Set |
| `LINKEDIN_CLIENT_SECRET` | C (Auto-Publish) | Set |
| `LINKEDIN_ACCESS_TOKEN` | C (Auto-Publish) | Set |
| `LINKEDIN_PERSON_ID` | C (Auto-Publish) | Set |

## Module Breakdown

### Module A: Directory Submission Templates
- No API keys required — templates are static data with manual submission workflow.

### Module B: Content Generation + Approval Queue
- `ANTHROPIC_API_KEY` — Required for Claude API calls. Uses claude-haiku-4-5 for drafts (cheap), claude-sonnet-4-6 for approved rewrites (quality).

### Module C: Auto-Publish Connectors
- **Dev.to**: `DEVTO_API_KEY` — POST https://dev.to/api/articles
- **X/Twitter**: `TWITTER_API_KEY` + `TWITTER_API_SECRET` + `TWITTER_ACCESS_TOKEN` + `TWITTER_ACCESS_SECRET` — OAuth 1.0a for Twitter API v2
- **LinkedIn**: `LINKEDIN_ACCESS_TOKEN` + `LINKEDIN_PERSON_ID` — Bearer token + person URN for LinkedIn REST API
- **Hashnode**: `HASHNODE_TOKEN` + `HASHNODE_PUBLICATION_ID` — GraphQL API at gql.hashnode.com
