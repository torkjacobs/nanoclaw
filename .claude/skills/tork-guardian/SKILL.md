# Tork Guardian — Governance Middleware

Host-level middleware that governs ALL agent interactions via Tork's governance API. Runs PII detection, policy enforcement, and generates SOC2 compliance receipts for every inbound and outbound message. This is NOT a command skill — it's pipeline middleware.

## How It Works

- **Inbound governance**: Every message is sent to `POST https://tork.network/api/v1/govern` BEFORE reaching the agent container. If the API blocks the message, the user gets a decline notice with a receipt ID. If PII is detected, the sanitized version is forwarded instead.
- **Outbound governance**: Every agent response is governed BEFORE being sent to WhatsApp. PII in responses is automatically redacted.
- **Fail-open**: If `TORK_API_KEY` is not set or the API is unreachable, messages pass through unmodified. The agent is never broken by governance failures.
- **On-demand status**: `@tork governance` shows daily counters and protection status.

## Configuration

Set `TORK_API_KEY` in `.env` to enable governance. Without it, the module logs a warning and skips all governance checks.

## API Contract

Calls `POST https://tork.network/api/v1/govern` with:
```json
{
  "input": "<message text>",
  "config": {
    "pii_detection": true,
    "policy_enforcement": true,
    "generate_receipt": true,
    "framework": "SOC2",
    "metadata": {
      "source": "nanoclaw-whatsapp",
      "agent_name": "Tork",
      "channel": "whatsapp",
      "group_jid": "<group JID>"
    }
  }
}
```

Headers: `x-api-key` from `TORK_API_KEY`, `Content-Type: application/json`.

Expected response fields: `allowed`, `sanitizedInput`, `piiDetected`, `receipt_id`, `flags`.

## On-Demand Output

```
🛡️ Tork Guardian — Active
• Messages governed today: 42
• PII detections: 3
• Policy blocks: 1
• Last receipt: abc-123-def
• Status: Protected ✅

2:15 PM AEST
```

## Daily Stats

Stored in `store/guardian-stats.json`, automatically reset each day.

## Logging

| Level | Event |
|-------|-------|
| INFO | Every governance decision (with receipt ID) |
| WARN | PII detections, policy blocks |
| ERROR | API errors (fail-open, message passes through) |

## Files

| File | Purpose |
|------|---------|
| `src/tork-guardian.ts` | Core governance module: API calls, stats, status command |
| `src/index.ts` | Integration: inbound/outbound governance in message pipeline |
| `store/guardian-stats.json` | Daily governance counters (auto-reset) |

## Customization

To change the governance framework, edit the `framework` field in the request body in `src/tork-guardian.ts`. To adjust the API timeout, modify `REQUEST_TIMEOUT_MS`.
