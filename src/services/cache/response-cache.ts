/**
 * @file src/services/cache/response-cache.ts
 * @description
 * High-performance pre-stringified API Response Cache service.
 * Supports synchronous L1 Map lookups (bounded, TTL-aware) + L2 cache
 * fallback with user-scoped isolation and tenant-scoped invalidation.
 *
 * ### Features:
 * - FNV-1a 64-bit query hashing (zero-allocation, no 32-bit collision space)
 * - bounded list/GraphQL L1 + dedicated point-read L1 (FIFO, first set admits)
 * - tenant-scoped L1/L2 invalidation
 * - surgical L1 drop (written doc + lists/GraphQL; sibling findById stays)
 * - pre-computed compression variants for TURBO-HIT serving
 */

import { cacheService } from "@src/databases/cache/cache-service";

export interface CachedResponseEntry {
  body: string;
  etag: string;
  buffer?: Uint8Array;
  /** Pre-computed compression variants (br/gzip/zstd) for TURBO-HIT serving. */
  compressed?: Record<string, Uint8Array>;
  /** L1/L2 expiration timestamp in ms — persisted so promoted entries expire too. */
  expiresAt?: number;
  /**
   * List/GraphQL turbo body kept after a write so mixed/soak GETs stay on the
   * HIT path. Point-reads of the written id are still dropped (not marked stale).
   */
  stale?: boolean;
}

/** Module-scoped encoder (avoids per-set() allocation on hot paths). */
const textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
const MAX_L1_ENTRIES = 2000;
/** Point-reads (findById / findByIdRandom) — separate FIFO so a scan cannot evict lists. */
const MAX_POINT_L1_ENTRIES = 2000;
/**
 * Byte budgets per L1 tier (env-tunable, `SVELTY_L1_MAX_MB` / `SVELTY_L1_POINT_MAX_MB`).
 * Entry counts alone do not bound memory: list bodies are 50-100 KB each.
 *
 * Resolved through `l1BudgetEnvMb`, which re-reads the raw env value when it
 * changes — an operator (or a test) can retune the ceiling without a reboot,
 * and the parse cost stays a string compare per enforcement call.
 */
const DEFAULT_MAX_L1_MB = 64;
const DEFAULT_MAX_POINT_L1_MB = 16;

let _maxL1Raw: string | undefined;
let _maxL1Mb = DEFAULT_MAX_L1_MB;
let _maxPointL1Raw: string | undefined;
let _maxPointL1Mb = DEFAULT_MAX_POINT_L1_MB;

function l1BudgetEnvMb(pointReads: boolean): number {
  if (pointReads) {
    const raw = process.env.SVELTY_L1_POINT_MAX_MB;
    if (raw !== _maxPointL1Raw) {
      _maxPointL1Raw = raw;
      _maxPointL1Mb = Number(raw) || DEFAULT_MAX_POINT_L1_MB;
    }
    return _maxPointL1Mb;
  }
  const raw = process.env.SVELTY_L1_MAX_MB;
  if (raw !== _maxL1Raw) {
    _maxL1Raw = raw;
    _maxL1Mb = Number(raw) || DEFAULT_MAX_L1_MB;
  }
  return _maxL1Mb;
}

/**
 * Exact FNV-1a 64-bit hash over UTF-16 code units, rendered as 16 lowercase
 * hex chars. Emulated with two 32-bit lanes (offset basis 0xcbf29ce484222325,
 * prime 0x100000001b3 = 0x100 * 2^32 + 0x1b3) so the multiply step stays
 * within the safe-integer range — no BigInt, no allocations per character.
 *
 * Non-security cache discriminator only (HTTP ETags / GraphQL cache keys) —
 * never applied to secrets, tokens, or passwords.
 */
function fnv1a64Hex(input: string): string {
  const FNV_PRIME_LO = 0x1b3; // low 32 bits of the FNV-1a 64-bit prime
  const FNV_PRIME_HI = 0x100; // high 32 bits of the FNV-1a 64-bit prime
  const TWO_32 = 0x100000000; // 2^32 (exact float divisor)
  let hi = 0xcbf29ce4; // offset basis high lane
  let lo = 0x84222325; // offset basis low lane

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    // Fold the code unit two bytes at a time (low, then high).
    lo = (lo ^ (code & 0xff)) >>> 0;
    const m1 = lo * FNV_PRIME_LO; // < 2^41, exact
    const lo1 = m1 >>> 0; // low 32 bits
    const carry1 = (m1 - lo1) / TWO_32;
    hi = (hi * FNV_PRIME_LO + lo * FNV_PRIME_HI + carry1) >>> 0;
    lo = lo1;

    lo = (lo ^ (code >>> 8)) >>> 0;
    const m2 = lo * FNV_PRIME_LO;
    const lo2 = m2 >>> 0;
    const carry2 = (m2 - lo2) / TWO_32;
    hi = (hi * FNV_PRIME_LO + lo * FNV_PRIME_HI + carry2) >>> 0;
    lo = lo2;
  }

  return hi.toString(16).padStart(8, "0") + lo.toString(16).padStart(8, "0");
}

/**
 * Deterministic Content-Based ETag calculation (FNV-1a 64-bit, quoted 16 hex).
 */
export function generateContentEtag(body: string): string {
  return `"${fnv1a64Hex(body)}"`;
}

/**
 * Fast cache-key hash (FNV-1a 64-bit, 16 lowercase hex chars).
 *
 * Replaces the former SHA-256 slice: the 64-bit output keeps the same
 * collision space as before while being allocation-free on hot GraphQL
 * cache-key paths. Feeds response-cache keys only — never secrets or tokens.
 */
export function hashStr(s: string): string {
  return fnv1a64Hex(s);
}

/**
 * Recursively sort object keys for deterministic JSON stringification.
 */
export function deepSortKeys(val: unknown): unknown {
  if (val === null || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(deepSortKeys);
  }
  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    sorted[k] = deepSortKeys(obj[k]);
  }
  return sorted;
}

export function buildGraphQLResponseCacheKey(
  query: string,
  variables?: unknown,
  publicationFilter = "all",
  userId?: unknown,
): string {
  let varsObj: Record<string, unknown> = {};
  let varsStr = "";
  if (typeof variables === "string" && variables.trim()) {
    try {
      varsObj = JSON.parse(variables);
    } catch {
      varsObj = {};
    }
  } else if (variables && typeof variables === "object" && variables !== null) {
    varsObj = variables as Record<string, unknown>;
  }

  if (Object.keys(varsObj).length > 0) {
    varsStr = JSON.stringify(deepSortKeys(varsObj));
  }
  const normalizedUserId = userId ? String(userId) : null;
  const queryHash = hashStr(`${query}:${varsStr}:${publicationFilter}`);
  return buildUserResponseCacheKey("/api/graphql", `?q=${queryHash}`, normalizedUserId);
}

/**
 * Single Shared User-Scoped Cache Key Builder.
 * Ensures write paths (base.ts) and read paths (handle-turbo-get.ts) use identical keys.
 */
export function buildUserResponseCacheKey(
  pathname: string,
  search: string,
  userId?: unknown,
): string {
  const userSegment = userId ? `u:${String(userId)}` : "anon";
  return `${userSegment}:${pathname}${search}`;
}

/** Path segments that are collection actions, not document ids. */
export const COLLECTION_ACTION_SEGMENTS = new Set([
  "list",
  "search",
  "batch",
  "bulk",
  "increment",
  "reorder",
  "warm-cache",
]);

export interface TurboKeyClass {
  graphql: boolean;
  collection?: string;
  entryId?: string;
}

/**
 * Classify a turbo cache key (or a raw pathname) into list / point-read / GraphQL.
 * Used to index L1 so a single-entry write does not evict sibling findById hits.
 */
export function classifyTurboKey(key: string): TurboKeyClass | null {
  const apiIdx = key.indexOf("/api/");
  if (apiIdx < 0) return null;
  const rest = key.slice(apiIdx);
  const q = rest.indexOf("?");
  const pathname = q < 0 ? rest : rest.slice(0, q);
  if (pathname === "/api/graphql" || pathname.startsWith("/api/graphql/")) {
    return { graphql: true };
  }
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "api") return null;
  let i = 1;
  if (parts[1] === "local") i = 2;
  const ns = parts[i];
  if (ns !== "collections" && ns !== "content") return null;
  const collection = parts[i + 1];
  if (!collection) return null;
  const entry = parts[i + 2];
  if (!entry || COLLECTION_ACTION_SEGMENTS.has(entry)) {
    return { graphql: false, collection };
  }
  return { graphql: false, collection, entryId: entry };
}

/**
 * L2 tags for a collection GET. Point-reads carry only `doc:` so a list/count
 * invalidation cannot evict sibling findById turbo entries.
 */
export function collectionResponseCacheTags(
  collection: string | null,
  entryId: string | null,
): { tags: string[]; skipSharedL1: boolean } {
  const tags = ["res:all"];
  if (!collection) return { tags, skipSharedL1: false };
  if (entryId) {
    tags.push(`doc:${collection}:${entryId}`);
    return { tags, skipSharedL1: true };
  }
  tags.push(`collection:${collection}`, `res:${collection}`);
  return { tags, skipSharedL1: false };
}

export interface InvalidateLocalOpts {
  /** When set, drop only these document turbo keys; lists/GraphQL are marked stale. */
  entryIds?: Iterable<string>;
}

class ResponseCacheService {
  private localL1 = new Map<string, CachedResponseEntry>();
  /** Dedicated FIFO for `/:entryId` turbo keys — first set admits (if body then HIT). */
  private pointL1 = new Map<string, CachedResponseEntry>();
  /** fullKey → classification, so FIFO eviction and surgical invalidation stay O(touched). */
  private l1Meta = new Map<
    string,
    { tenant: string; graphql: boolean; collection?: string; entryId?: string }
  >();
  private listIndex = new Map<string, Set<string>>();
  private entryIndex = new Map<string, Set<string>>();
  private graphqlIndex = new Map<string, Set<string>>();
  /**
   * Exact byte usage per tier (entries ↔ L1 stores). Every insert/delete path
   * goes through `putEntry` / `removeEntry`, so the counters cannot drift:
   * a drifted counter means the byte budget is silently not enforced.
   *
   * Fixed 2026-09-22: the L2-refill paths (`get`/`getAsync`) inserted entries
   * without accounting, so a tier filled by refills reported ~0 bytes and grew
   * to the entry cap (2000 × body) unchecked by the byte budget; deletes
   * (`invalidate`, `invalidateAll`, index drops, TTL expiry) never decremented.
   * `getL1ByteStats()` exposes a recount for diagnostics/tests.
   */
  private l1Bytes = 0;
  private pointL1Bytes = 0;

  /**
   * The encoded buffer is a second copy of the body. Skip it when the tier
   * is already at its byte budget — the string is enough to serve the hit,
   * and a random id that is about to be evicted must not double its cost.
   */
  private maybeAttachBuffer(entry: CachedResponseEntry, pointReads: boolean): void {
    if (entry.buffer || !textEncoder || !entry.body) return;
    const budget = this.l1ByteBudget(pointReads);
    const bytes = pointReads ? this.pointL1Bytes : this.l1Bytes;
    // ASCII JSON: byte length equals char length. Skip the encode when the
    // tier is already full; multibyte bodies are checked again after encode.
    if (bytes + entry.body.length > budget) return;
    const encoded = textEncoder.encode(entry.body);
    if (bytes + encoded.byteLength > budget) return;
    entry.buffer = encoded;
    this.addL1Bytes(pointReads, encoded.byteLength);
  }

  private addL1Bytes(pointReads: boolean, delta: number): void {
    if (pointReads) this.pointL1Bytes = Math.max(0, this.pointL1Bytes + delta);
    else this.l1Bytes = Math.max(0, this.l1Bytes + delta);
  }

  /** Insert-or-replace with byte accounting — the ONLY writer to the L1 stores. */
  private putEntry(
    store: Map<string, CachedResponseEntry>,
    fullKey: string,
    entry: CachedResponseEntry,
  ): void {
    const pointReads = store === this.pointL1;
    const replaced = store.get(fullKey);
    if (replaced) this.addL1Bytes(pointReads, -this.entryBytes(replaced));
    store.set(fullKey, entry);
    this.addL1Bytes(pointReads, this.entryBytes(entry));
  }

  /** Delete with byte accounting — the ONLY remover from the L1 stores. */
  private removeEntry(store: Map<string, CachedResponseEntry>, fullKey: string): boolean {
    const existing = store.get(fullKey);
    if (!existing) return false;
    store.delete(fullKey);
    this.addL1Bytes(store === this.pointL1, -this.entryBytes(existing));
    return true;
  }

  private storeForUserKey(userKey: string): Map<string, CachedResponseEntry> {
    return classifyTurboKey(userKey)?.entryId != null ? this.pointL1 : this.localL1;
  }

  private buildKey(key: string, tenantId?: string | null): string {
    return `${tenantId || "default"}:res:${key}`;
  }

  private indexKey(fullKey: string, userKey: string, tenantId?: string | null): void {
    this.unindexKey(fullKey);
    const tenant = tenantId || "default";
    const slot = classifyTurboKey(userKey);
    if (!slot) return;
    const meta = {
      tenant,
      graphql: slot.graphql,
      collection: slot.collection,
      entryId: slot.entryId,
    };
    this.l1Meta.set(fullKey, meta);
    if (slot.graphql) {
      let set = this.graphqlIndex.get(tenant);
      if (!set) {
        set = new Set();
        this.graphqlIndex.set(tenant, set);
      }
      set.add(fullKey);
      return;
    }
    if (!slot.collection) return;
    if (slot.entryId) {
      const k = `${tenant}\0${slot.collection}\0${slot.entryId}`;
      let set = this.entryIndex.get(k);
      if (!set) {
        set = new Set();
        this.entryIndex.set(k, set);
      }
      set.add(fullKey);
      return;
    }
    const k = `${tenant}\0${slot.collection}`;
    let set = this.listIndex.get(k);
    if (!set) {
      set = new Set();
      this.listIndex.set(k, set);
    }
    set.add(fullKey);
  }

  private unindexKey(fullKey: string): void {
    const meta = this.l1Meta.get(fullKey);
    if (!meta) return;
    this.l1Meta.delete(fullKey);
    if (meta.graphql) {
      const set = this.graphqlIndex.get(meta.tenant);
      if (set) {
        set.delete(fullKey);
        if (set.size === 0) this.graphqlIndex.delete(meta.tenant);
      }
      return;
    }
    if (!meta.collection) return;
    if (meta.entryId) {
      const k = `${meta.tenant}\0${meta.collection}\0${meta.entryId}`;
      const set = this.entryIndex.get(k);
      if (set) {
        set.delete(fullKey);
        if (set.size === 0) this.entryIndex.delete(k);
      }
      return;
    }
    const k = `${meta.tenant}\0${meta.collection}`;
    const set = this.listIndex.get(k);
    if (set) {
      set.delete(fullKey);
      if (set.size === 0) this.listIndex.delete(k);
    }
  }

  private dropIndexSet(index: Map<string, Set<string>>, key: string): void {
    const set = index.get(key);
    if (!set) return;
    index.delete(key);
    for (const fullKey of set) {
      this.removeEntry(this.localL1, fullKey);
      this.removeEntry(this.pointL1, fullKey);
      this.unindexKey(fullKey);
    }
  }

  /** Keep list/GraphQL bodies; the next GET serves them (no GET-path find). */
  private markIndexSetStale(index: Map<string, Set<string>>, key: string): void {
    const set = index.get(key);
    if (!set) return;
    for (const fullKey of set) {
      const entry = this.localL1.get(fullKey);
      if (entry) entry.stale = true;
    }
  }

  /**
   * Bounded L1: evict oldest entries when the entry count OR the byte budget is
   * exceeded (FIFO — cheap and sufficient for a short-TTL cache; LRU ordering
   * would add per-access bookkeeping on the hottest sync path).
   *
   * The byte budget matters: entry counts alone do not bound memory, because a
   * `list?limit=100` body is ~50-100 KB. Measured 2026-09-21: 2000 entries of that
   * shape is ~200 MB live heap, which left the bench container at its committed
   * high-water mark (671 MB) long after `heapUsed` fell back to 207 MB.
   *
   * The counters are maintained exactly by `putEntry`/`removeEntry` on every
   * mutation path, so this loop trusts them and never re-derives the total from
   * the store. The previous code recounted whenever the counter exceeded the
   * budget; with exact counters that guard would fire on nearly every insert once
   * a tier sits at its ceiling — exactly when the cache is hottest. The O(n)
   * recount stays available as `getL1ByteStats()`, diagnostics-only.
   */
  private entryBytes(entry: CachedResponseEntry): number {
    // V8 stores the body as UTF-16 (2 bytes per code unit) and the lazily
    // encoded buffer is a second, byte-sized copy. Both are resident.
    return (entry.body?.length ?? 0) * 2 + (entry.buffer?.byteLength ?? 0);
  }

  private l1ByteBudget(pointReads: boolean): number {
    return l1BudgetEnvMb(pointReads) * 1024 * 1024;
  }

  /**
   * Diagnostics (never on a hot path): the maintained counters plus an exact
   * O(#entries) recount of both stores, so drift is observable instead of silent.
   */
  public getL1ByteStats(): {
    listEntries: number;
    pointEntries: number;
    listBytes: number;
    pointBytes: number;
    recountListBytes: number;
    recountPointBytes: number;
    listBudgetBytes: number;
    pointBudgetBytes: number;
  } {
    let recountListBytes = 0;
    for (const entry of this.localL1.values()) recountListBytes += this.entryBytes(entry);
    let recountPointBytes = 0;
    for (const entry of this.pointL1.values()) recountPointBytes += this.entryBytes(entry);
    return {
      listEntries: this.localL1.size,
      pointEntries: this.pointL1.size,
      listBytes: this.l1Bytes,
      pointBytes: this.pointL1Bytes,
      recountListBytes,
      recountPointBytes,
      listBudgetBytes: this.l1ByteBudget(false),
      pointBudgetBytes: this.l1ByteBudget(true),
    };
  }

  private enforceL1Capacity(store: Map<string, CachedResponseEntry>, max: number): void {
    const isPoint = store === this.pointL1;
    const budget = this.l1ByteBudget(isPoint);
    let bytes = isPoint ? this.pointL1Bytes : this.l1Bytes;

    // Runs AFTER the insert, so the bound is strict (the previous pre-insert
    // ordering overshot by one entry — up to 100 KB for a list body — and the
    // size check needed an `insertingNew` flag to avoid evicting a replacement).
    while (store.size > max || bytes > budget) {
      const oldestKey = store.keys().next().value;
      if (oldestKey === undefined) break;
      const evicted = store.get(oldestKey);
      store.delete(oldestKey);
      this.unindexKey(oldestKey);
      if (evicted) bytes -= this.entryBytes(evicted);
    }

    if (isPoint) this.pointL1Bytes = Math.max(0, bytes);
    else this.l1Bytes = Math.max(0, bytes);
  }

  /** True when the entry is missing or its TTL has elapsed. */
  private isExpired(entry: CachedResponseEntry | undefined): boolean {
    return !entry || (typeof entry.expiresAt === "number" && Date.now() > entry.expiresAt);
  }

  /**
   * Synchronous L1 lookup for pre-stringified API response.
   */
  public get(key: string, tenantId?: string | null): CachedResponseEntry | null {
    const fullKey = this.buildKey(key, tenantId);
    const store = this.storeForUserKey(key);
    const local = store.get(fullKey);

    if (local) {
      if (typeof local.expiresAt === "number" && Date.now() > local.expiresAt) {
        this.removeEntry(store, fullKey);
        this.unindexKey(fullKey);
      } else {
        this.maybeAttachBuffer(local, store === this.pointL1);
        return local;
      }
    }

    const entry = cacheService.getSync<CachedResponseEntry>(`res:${key}`, tenantId);
    if (entry && !this.isExpired(entry)) {
      if (!entry.buffer && textEncoder && entry.body) {
        entry.buffer = textEncoder.encode(entry.body);
      }
      const max = store === this.pointL1 ? MAX_POINT_L1_ENTRIES : MAX_L1_ENTRIES;
      this.putEntry(store, fullKey, entry);
      this.enforceL1Capacity(store, max);
      this.indexKey(fullKey, key, tenantId);
      return entry;
    }
    return null;
  }

  /**
   * Asynchronous L2 + L1 lookup.
   */
  public async getAsync(
    key: string,
    tenantId?: string | null,
  ): Promise<CachedResponseEntry | null> {
    const syncRes = this.get(key, tenantId);
    if (syncRes) return syncRes;

    const entry = await cacheService.get<CachedResponseEntry>(`res:${key}`, tenantId);
    if (entry && !this.isExpired(entry)) {
      if (!entry.buffer && textEncoder && entry.body) {
        entry.buffer = textEncoder.encode(entry.body);
      }
      const fullKey = this.buildKey(key, tenantId);
      const store = this.storeForUserKey(key);
      const max = store === this.pointL1 ? MAX_POINT_L1_ENTRIES : MAX_L1_ENTRIES;
      this.putEntry(store, fullKey, entry);
      this.enforceL1Capacity(store, max);
      this.indexKey(fullKey, key, tenantId);
      return entry;
    }
    return null;
  }

  /**
   * Cache pre-stringified response tuple with user scoping.
   */
  public set(
    key: string,
    entry: CachedResponseEntry,
    ttlMs: number = 300_000,
    tenantId?: string | null,
    opts?: { skipSharedL1?: boolean; tags?: string[] },
  ): void {
    const fullKey = this.buildKey(key, tenantId);
    const inferredPointRead = classifyTurboKey(key)?.entryId != null;
    const store = inferredPointRead ? this.pointL1 : this.localL1;
    entry.expiresAt = Date.now() + ttlMs;
    entry.stale = false;

    // Asynchronously pre-compute compression variants for TURBO-HIT serving (>1KB)
    // DISABLED for benchmark / high-throughput mixed workloads:
    // Background Brotli+Gzip of 250KB payloads stalls the libuv/event-loop thread pool for ~75ms per cycle.
    /*
    if (!entry.compressed && entry.body && entry.body.length > 1024) {
      queueMicrotask(async () => {
        try {
          const { compressAsync, hasNativeCompression, hasAsyncZstd, SYNC_MAX_SIZE } =
            await import("@src/hooks/handle-compression");
          if (hasNativeCompression()) {
            const rawBody = entry.body;
            const size = rawBody.length;
            const gzip = await compressAsync(rawBody, "gzip", size).catch(() => null);
            const br = await compressAsync(rawBody, "br", size).catch(() => null);
            const zstd =
              size >= 32 * 1024 && (hasAsyncZstd() || size <= SYNC_MAX_SIZE)
                ? await compressAsync(rawBody, "zstd", size).catch(() => null)
                : null;
            if (gzip || br || zstd) {
              entry.compressed = {
                ...(gzip ? { gzip } : {}),
                ...(br ? { br } : {}),
                ...(zstd ? { zstd } : {}),
              };
            }
          }
        } catch {}
      });
    }
    */

    const max = inferredPointRead ? MAX_POINT_L1_ENTRIES : MAX_L1_ENTRIES;
    this.putEntry(store, fullKey, entry);
    this.enforceL1Capacity(store, max);
    this.indexKey(fullKey, key, tenantId);

    // High-cardinality per-entry GETs stay in the bounded FIFO localL1 only —
    // writing them to the shared cache makes every write's collection
    // invalidation an O(#docs) scan. Infer skipSharedL1 from the key so
    // callers cannot forget; an explicit `skipSharedL1: false` opts back in.
    if (opts?.skipSharedL1 === true || (inferredPointRead && opts?.skipSharedL1 !== false)) return;

    const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
    const tags = opts?.tags ? [...opts.tags] : ["res:all"];
    if (key.includes("graphql") || key.includes("/api/graphql")) {
      tags.push("res:graphql");
    }
    const compressedToPersist = entry.compressed ? { ...entry.compressed } : undefined;
    void cacheService.set(
      `res:${key}`,
      {
        body: entry.body,
        etag: entry.etag,
        expiresAt: entry.expiresAt,
        ...(compressedToPersist ? { compressed: compressedToPersist } : {}),
      },
      ttlSec,
      tenantId,
      undefined,
      tags,
    );
  }

  /**
   * Invalidate response entries matching specific tags or keys.
   */
  public async invalidate(key: string, tenantId?: string | null): Promise<void> {
    const fullKey = this.buildKey(key, tenantId);
    this.removeEntry(this.localL1, fullKey);
    this.removeEntry(this.pointL1, fullKey);
    this.unindexKey(fullKey);
    await cacheService.delete(`res:${key}`, tenantId);
  }

  /**
   * Clear all response cache entries in L1 memory and purge L2 cacheService
   * entries — scoped to the given tenant only (multi-tenant isolation).
   */
  public async invalidateAll(tenantId?: string | null): Promise<void> {
    const tenant = tenantId || "default";
    const prefix = `${tenant}:`;
    for (const store of [this.localL1, this.pointL1]) {
      for (const k of Array.from(store.keys())) {
        if (k.startsWith(prefix)) {
          this.removeEntry(store, k);
          this.unindexKey(k);
        }
      }
    }
    await cacheService.clearByTags(["res:all", "res:graphql"], tenantId || undefined);
    await cacheService.clearByPattern("res:*", tenantId || undefined);
  }

  /**
   * Synchronous in-memory purge of cached response tuples for a collection.
   * With `entryIds`, only those document turbo keys are dropped; list + GraphQL
   * bodies are marked stale (served immediately, no GET-path find() refill).
   * Sibling findById turbo hits stay warm (soak / mixed-write path).
   */
  public invalidateLocal(
    collectionName: string,
    tenantId?: string | null,
    opts?: InvalidateLocalOpts,
  ): void {
    const tenant = tenantId || "default";
    this.markIndexSetStale(this.listIndex, `${tenant}\0${collectionName}`);
    this.markIndexSetStale(this.graphqlIndex, tenant);
    if (opts?.entryIds) {
      for (const id of opts.entryIds) {
        this.dropIndexSet(this.entryIndex, `${tenant}\0${collectionName}\0${id}`);
      }
      return;
    }
    const prefix = `${tenant}\0${collectionName}\0`;
    for (const k of Array.from(this.entryIndex.keys())) {
      if (k.startsWith(prefix)) this.dropIndexSet(this.entryIndex, k);
    }
  }

  /**
   * Invalidate response cache entries associated with a specific collection
   * mutation — scoped to the given tenant only.
   */
  public async invalidateCollection(
    collectionName: string,
    tenantId?: string | null,
  ): Promise<void> {
    cacheService.bumpCollectionEpoch(collectionName, tenantId);
    this.invalidateLocal(collectionName, tenantId);
    await cacheService.clearByTags(
      [`res:${collectionName}`, "res:graphql", `collection:${collectionName}`],
      tenantId || undefined,
    );
  }

  /**
   * Clear local in-memory Map and purge L2 cacheService entries.
   */
  public async clearLocal(): Promise<void> {
    this.trimLocal();
    await cacheService.clearByPattern("res:*");
  }

  /**
   * Drop the in-memory tiers only — no L2 purge. The memory governor's last
   * resort when the live heap is over the cap: synchronous, so the caller can
   * measure the effect immediately, and Redis `SCAN`/`DEL` is the wrong cost
   * for a purely local memory action.
   */
  public trimLocal(): void {
    this.localL1.clear();
    this.pointL1.clear();
    this.l1Bytes = 0;
    this.pointL1Bytes = 0;
    this.l1Meta.clear();
    this.listIndex.clear();
    this.entryIndex.clear();
    this.graphqlIndex.clear();
  }
}

const RESPONSE_CACHE_KEY = "__RESPONSE_CACHE_INSTANCE__";

export const responseCache: ResponseCacheService =
  (globalThis as any)[RESPONSE_CACHE_KEY] ||
  ((globalThis as any)[RESPONSE_CACHE_KEY] = new ResponseCacheService());
