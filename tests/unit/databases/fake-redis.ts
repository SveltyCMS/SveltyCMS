/**
 * @file tests/unit/databases/fake-redis.ts
 * @description Deterministic in-memory Redis driver for the CacheService L2 contract suite.
 *
 * Implements the node-redis surface used by `CacheService` (get/set with
 * EX/NX/PX, del, mGet, multi pipelines, sAdd/sMembers, scan, publish/subscribe)
 * with TTL expiry, so the full distributed-cache path — cross-instance hits,
 * write batching, stampede locks, tenant-scoped tag sets, pattern scans and
 * pub/sub invalidation — can be tested without a live Redis.
 *
 * ### Features:
 * - TTL enforcement on read (get/mGet/scan skip expired entries)
 * - in-process pub/sub (publish delivers to subscribed callbacks)
 * - atomic multi() pipelines
 * - glob MATCH support for scan (same `*` semantics as Redis)
 */

type SetOptions = { EX?: number; PX?: number; NX?: boolean };

interface StoredEntry {
  value: string;
  expiresAt: number; // 0 = no expiry
}

interface MultiOp {
  op: "set" | "sAdd" | "del";
  key: string;
  value?: string;
  opts?: SetOptions;
}

/** Convert a Redis glob pattern to a RegExp (`*` → `.*`, rest escaped). */
function globToRegExp(pattern: string): RegExp {
  let out = "";
  for (const ch of pattern) {
    out += ch === "*" ? ".*" : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

export class FakeRedis {
  private store = new Map<string, StoredEntry>();
  private sets = new Map<string, Set<string>>();
  private channels = new Map<string, Set<(message: string) => void>>();

  isOpen = true;

  async connect(): Promise<void> {
    this.isOpen = true;
  }

  async destroy(): Promise<void> {
    this.store.clear();
    this.sets.clear();
    this.channels.clear();
    this.isOpen = false;
  }

  async quit(): Promise<void> {
    await this.destroy();
  }

  on(): this {
    return this; // error listeners — no-op for the fake
  }

  private isExpired(entry: StoredEntry): boolean {
    return entry.expiresAt > 0 && entry.expiresAt <= Date.now();
  }

  private rawGet(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async get(key: string): Promise<string | null> {
    return this.rawGet(key);
  }

  async set(key: string, value: string, opts?: SetOptions): Promise<string | null> {
    if (opts?.NX && this.rawGet(key) !== null) return null;

    const expiresAt = opts?.PX ? Date.now() + opts.PX : opts?.EX ? Date.now() + opts.EX * 1000 : 0;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    // node-redis accepts both del(k1, k2) and del([k1, k2]) — flatten both.
    const flat = keys.flat(Infinity) as string[];
    let deleted = 0;
    for (const key of flat) {
      if (this.store.delete(key)) deleted++;
      this.sets.delete(key);
    }
    return deleted;
  }

  async mGet(keys: string[]): Promise<(string | null)[]> {
    return keys.map((k) => this.rawGet(k));
  }

  multi(): {
    set: (key: string, value: string, opts?: SetOptions) => void;
    sAdd: (key: string, member: string) => void;
    del: (...keys: string[]) => void;
    exec: () => Promise<unknown[]>;
  } {
    // Arrow functions capture `this` lexically (the FakeRedis instance) —
    // no `self` aliasing needed.
    const ops: MultiOp[] = [];
    return {
      set: (key: string, value: string, opts?: SetOptions) => {
        ops.push({ op: "set", key, value, opts });
      },
      sAdd: (key: string, member: string) => {
        ops.push({ op: "sAdd", key, value: member });
      },
      del: (...keys: string[]) => {
        ops.push({ op: "del", key: keys.join("\u0000"), value: undefined });
      },
      exec: async () => {
        const replies: unknown[] = [];
        for (const op of ops) {
          if (op.op === "set") {
            if (op.opts?.NX && this.rawGet(op.key) !== null) {
              replies.push(null);
              continue;
            }
            const expiresAt = op.opts?.PX
              ? Date.now() + op.opts.PX
              : op.opts?.EX
                ? Date.now() + op.opts.EX * 1000
                : 0;
            this.store.set(op.key, { value: op.value!, expiresAt });
            replies.push("OK");
          } else if (op.op === "sAdd") {
            const set = this.sets.get(op.key) ?? new Set<string>();
            set.add(op.value!);
            this.sets.set(op.key, set);
            replies.push(1);
          } else {
            let deleted = 0;
            for (const key of op.key.split("\u0000")) {
              if (this.store.delete(key)) deleted++;
              this.sets.delete(key);
            }
            replies.push(deleted);
          }
        }
        return replies;
      },
    };
  }

  async sAdd(key: string, member: string): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    set.add(member);
    this.sets.set(key, set);
    return 1;
  }

  async sMembers(key: string): Promise<string[]> {
    const members = [...(this.sets.get(key) ?? [])];
    // Drop members whose cache entry expired (keeps tag sets honest).
    return members.filter((m) => this.rawGet(m) !== null);
  }

  async scan(
    cursor: string,
    opts: { MATCH?: string; COUNT?: number },
  ): Promise<{ cursor: string; keys: string[] }> {
    const pattern = opts.MATCH ?? "*";
    const regex = globToRegExp(pattern);
    const keys: string[] = [];
    for (const key of this.store.keys()) {
      if (regex.test(key) && this.rawGet(key) !== null) keys.push(key);
    }
    void cursor;
    void opts.COUNT;
    return { cursor: "0", keys };
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = globToRegExp(pattern);
    return [...this.store.keys()].filter((k) => regex.test(k));
  }

  async flushAll(): Promise<string> {
    this.store.clear();
    this.sets.clear();
    return "OK";
  }

  async publish(channel: string, message: string): Promise<number> {
    const listeners = this.channels.get(channel);
    if (!listeners) return 0;
    for (const cb of listeners) {
      try {
        cb(message);
      } catch {
        // subscriber errors must not break the publisher
      }
    }
    return listeners.size;
  }

  async subscribe(channel: string, cb: (message: string) => void): Promise<void> {
    const listeners = this.channels.get(channel) ?? new Set<(message: string) => void>();
    listeners.add(cb);
    this.channels.set(channel, listeners);
  }

  /** Snapshot of the raw store (for assertions on L2 contents). */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, entry] of this.store) {
      if (!this.isExpired(entry)) out[key] = entry.value;
    }
    return out;
  }
}
