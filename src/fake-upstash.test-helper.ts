/**
 * An in-memory stand-in for the Upstash REST /pipeline endpoint, with a controllable clock.
 * Implements only the commands ai-spend-cap.ts sends (plus HSET/ZSCORE for test setup).
 */
type Value = string | Map<string, string>;

export class FakeUpstash {
  now = Date.UTC(2026, 9, 17, 10, 15, 0);
  calls = 0;
  failing = false;
  private data = new Map<string, { value: Value; expiresAt: number | null }>();

  private live(key: string) {
    const entry = this.data.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= this.now) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  run(cmd: Array<string | number>): unknown {
    const [op, key, ...args] = cmd.map(String);
    const entry = this.live(key);
    switch (op) {
      case 'GET': return entry ? entry.value as string : null;
      case 'SET': {
        const nx = args.includes('NX');
        const px = args.indexOf('PX');
        if (nx && entry) return null;
        this.data.set(key, { value: args[0], expiresAt: px >= 0 ? this.now + Number(args[px + 1]) : null });
        return 'OK';
      }
      case 'INCR':
      case 'INCRBY': {
        const by = op === 'INCR' ? 1 : Number(args[0]);
        const next = Number(entry ? entry.value : 0) + by;
        this.data.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
        return next;
      }
      case 'EXPIRE': {
        if (!entry) return 0;
        entry.expiresAt = this.now + Number(args[0]) * 1000;
        return 1;
      }
      case 'PTTL': {
        if (!entry) return -2;
        return entry.expiresAt === null ? -1 : entry.expiresAt - this.now;
      }
      case 'DEL': {
        const had = entry ? 1 : 0;
        this.data.delete(key);
        return had;
      }
      case 'HGET': return entry ? (entry.value as Map<string, string>).get(args[0]) ?? null : null;
      case 'HSET': {
        const map = entry ? entry.value as Map<string, string> : new Map<string, string>();
        map.set(args[0], args[1]);
        this.data.set(key, { value: map, expiresAt: null });
        return 1;
      }
      case 'ZINCRBY': {
        const map = entry ? entry.value as Map<string, string> : new Map<string, string>();
        const next = Number(map.get(args[1]) ?? 0) + Number(args[0]);
        map.set(args[1], String(next));
        this.data.set(key, { value: map, expiresAt: entry?.expiresAt ?? null });
        return String(next);
      }
      case 'ZSCORE': return entry ? (entry.value as Map<string, string>).get(args[0]) ?? null : null;
      default: throw new Error(`FakeUpstash: unsupported ${op}`);
    }
  }

  fetch: typeof fetch = async (_url, init) => {
    this.calls++;
    if (this.failing) throw new TypeError('fetch failed');
    const commands = JSON.parse(String(init?.body)) as Array<Array<string | number>>;
    const results = commands.map((c) => ({ result: this.run(c) }));
    return new Response(JSON.stringify(results), { status: 200 });
  };
}
