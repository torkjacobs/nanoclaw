# Tork Competitor Watch

Host-level competitor monitoring that checks 5 AI security/governance competitor websites every 12 hours for changes. Posts alerts to the main group only when changes are detected.

## Competitors Monitored

| Site | Category |
|------|----------|
| lakera.ai | AI security |
| calypsoai.com | AI governance |
| arthurai.com | AI monitoring |
| robust-intelligence.com | AI security |
| protectai.com | AI security |

## Commands

| Command | Description |
|---------|-------------|
| `@tork competitors` | Show current status of all competitors |
| `@tork watch` | Alias for competitors |

## How It Works

1. Every 12 hours, fetches each competitor's homepage
2. Strips HTML tags to extract text content only (avoids false positives from dynamic elements)
3. SHA-256 hashes the text and compares to the stored hash in `store/competitor-hashes.json`
4. On first run, stores hashes silently (no alert)
5. On subsequent runs, posts an alert only if at least one site changed
6. On-demand `@tork competitors` shows last checked/changed times for all sites

## Alert Format

```
🔍 Competitor Alert — Changes Detected
• lakera.ai: Homepage updated (last checked: 12h ago)
• protectai.com: Homepage updated (last checked: 12h ago)
No changes: calypsoai.com, arthurai.com, robust-intelligence.com
```

## Status Format

```
🔍 Competitor Watch — Status

• lakera.ai (AI security): checked 6h ago, last change 3d ago
• calypsoai.com (AI governance): checked 6h ago, last change 12d ago
• arthurai.com (AI monitoring): checked 6h ago, last change 1d ago
• robust-intelligence.com (AI security): checked 6h ago, last change 7d ago
• protectai.com (AI security): checked 6h ago, last change 2d ago

4:18 pm AEST
```

## Configuration

- 15-second timeout per fetch
- SSL errors ignored (TLS verification temporarily disabled during fetch)
- First check runs 60 seconds after startup
- Hashes persist across restarts in `store/competitor-hashes.json`

## Files

| File | Purpose |
|------|---------|
| `src/tork-competitors.ts` | Fetch, hash, compare, alert, status, timer |
| `src/index.ts` | Message loop intercept and timer startup |
| `store/competitor-hashes.json` | Persisted hash state (auto-created) |
