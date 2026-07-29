# Tork Claims Verification

Pre-publish verification system that checks marketing content against verified claims. Prevents publishing content with incorrect numbers, banned claims, or sensitive information.

## Commands

| Command | Description |
|---------|-------------|
| `@tork claims` | Show all verified claims with correct values and known wrong values |
| `@tork verify` | Run claims verification on the last draft in the content queue |
| `@tork approve` | Approves and publishes — blocked if claims check fails |
| `@tork approve force` | Bypass claims check and publish anyway |

## How It Works

1. When you run `@tork approve`, the system checks the draft content against `store/verified-claims.json`
2. If any wrong claims are found (e.g. "<1ms" instead of "~20ms"), publish is blocked with specific warnings
3. Fix the content with `@tork refine [corrections]` and re-approve, or use `@tork approve force` to override

## Verified Claims

Stored in `store/verified-claims.json`. Each claim has:
- `verified` — the correct value to use
- `wrong_claims` — known incorrect values that trigger warnings
- `source` — where the number comes from

## Sensitive Items

Some claims are marked "DO NOT SHARE PUBLICLY":
- Infrastructure costs / margins
- Lines of code counts
- Specific enterprise customer counts

Content mentioning these topics is flagged automatically.

## Files

| File | Purpose |
|------|---------|
| `src/tork-claims.ts` | Verification engine, command handlers |
| `store/verified-claims.json` | Source of truth for all marketing claims |
| `src/tork-marketing.ts` | Integration point (handleApprove calls verifyContent) |
| `src/index.ts` | Host command routing for @tork claims / @tork verify |
