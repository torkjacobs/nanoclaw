# Tork Website Monitor

Lightweight host-level health checker for Tork network endpoints. Runs every 6 hours and posts status to the main WhatsApp group. Also responds on-demand to `@tork health` or `@tork status`.

## Monitored Endpoints

| Endpoint | URL | Expected |
|----------|-----|----------|
| Main site | https://tork.network | 200 |
| API /govern | https://tork.network/api/v1/govern | 200 or 401 |
| Demo site | https://demo.tork.network | 200 |
| Innovation | https://innovation.tork.network | 200 |

## How It Works

- **Scheduled**: Timer fires every 6 hours (first check 30s after startup). No container overhead — runs directly in the Node.js host process.
- **On-demand**: Messages matching `@tork health` or `@tork status` are intercepted in the message loop before container dispatch, handled inline.
- Each endpoint is checked with a 15-second timeout via `fetch()`.
- Results are posted as a formatted summary with status codes and response times.

## Output Format

All systems healthy:
```
🟢 Tork Health Check — All Systems Operational
• tork.network: 200 (142ms)
• API /govern: 401 (23ms)
• demo.tork.network: 200 (89ms)
• innovation.tork.network: 200 (201ms)
Last checked: 2:15 PM AEST
```

Service degraded (any endpoint returns non-acceptable status or times out):
```
🔴 Tork Alert — Service Degraded
• innovation.tork.network: 503 (timeout)
All other services operational.
Last checked: 2:15 PM AEST
```

## Files

| File | Purpose |
|------|---------|
| `src/tork-monitor.ts` | Health check logic, timer, message pattern matching |
| `src/index.ts` | Integration: timer startup + message loop intercept |

## Customization

To add/remove endpoints, edit the `ENDPOINTS` array in `src/tork-monitor.ts`. To change the check interval, modify `HEALTH_CHECK_INTERVAL_MS`.
