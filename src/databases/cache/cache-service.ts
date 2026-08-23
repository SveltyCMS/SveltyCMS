/**
 * @file src/databases/cache/cache-service.ts
 * @description High-performance hybrid L1/L2 caching service for SveltyCMS.
 *
 * Coordinates L1 (in-memory LRU) and L2 (Redis) caching layers with stampede protection,
 * negative Bloom caching, micro-batch write pipelines, and edge invalidation synchronization.
 *
 * ### Features:
 * - Sub-microsecond L1 LRU hits
 * - 2-Level namespace buckets for O(1) prefix invalidation
 * - Single-flight query coalescing and distributed NX/PX stampede locking
 * - Micro-batch Redis write pipelines
 * - Tenant-partitioned tag indexes
 */

import { logger } from "@utils/logger";
import { generateUUID } from "@utils/native-utils";
import { LRUCache } from "lru-cache";
import { CacheCategory, type CacheStats } from "./types";
import { cacheMetrics } from "./cache-metrics";
import { CacheLockManager } from "./cache-locks";
import { NegativeCacheManager } from "./negative-cache";
import { RedisWriteBatcher, serializeL2Value, deserializeL2Value } from "./redis-pipeline";

export const API_CACHE_TTL_S = 300;
export const SESSION_CACHE_TTL_MS = 86400000;
export const USER_PERM_CACHE_TTL_MS = 3600000;
export const USER_PERM_CACHE_TTL_S = 3600;
export const USER_COUNT_CACHE_TTL_MS = 3600000;
export const USER_COUNT_CACHE_TTL_S = 3600;

// 🚀 ADAPTIVE TTL: Per-category TTL profiles for L1 cache.
export const CATEGORY_TTL_SECONDS: Record<string, number> = {
  schema: 3600, // 1 hour  — rarely changes between deploys
  setting: 1800, // 30 min  — config changes are deliberate
  theme: 1800, // 30 min
  session: 900, // 15 min  — security-sensitive
  system: 600, // 10 min
  collection: 300, // 5 min   — default
  widget: 300, // 5 min
  content: 120, // 2 min   — frequently stale
  entry: 60, // 1 min   — content changes often
  user: 300, // 5 min
  media: 300, // 5 min
  api: 30, // 30 sec  — API responses change fast
  auth: 300, // 5 min
  general: 300, // 5 min   — fallback
};

export class CacheService {
  private l1: LRUCache<string, any>;
  private l2: any = null;
  private subscriber: any = null;
  private nodeId: string;
  private readonly INVALIDATION_CHANNEL = "svelty:cache:invalidation";

  // Reverse Tag Indexing
  private tagMap: Map<string, Set<string>> = new Map();
  private keyToTags: Map<string, Set<string>> = new Map();

  // 🚀 Lean 2-Level Namespace Bucket (replaces 8-level prefixMap)
  private prefixMap: Map<string, Set<string>> = new Map();
  private _isBulkClearing = false;

  // Subsystem Managers
  private locks = new CacheLockManager();
  private negative = new NegativeCacheManager();
  private batcher = new RedisWriteBatcher();

  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    l1Hits: 0,
    l2Hits: 0,
    l1Size: 0,
    size: 0,
    deletes: 0,
  };

  private bootstrapping = false;
  private latencyBuffer: number[] = [];
  private readonly MAX_LATENCY_SAMPLES = 100;
  private _metrics: any = null;
  private _cdnResolved = false;
  private _cdnActive = false;

  constructor() {
    this.l1 = new LRUCache<string, any>({
      max: 500000,
      ttl: 1000 * 60 * 5,
      dispose: (_value: any, key: string) => {
        this.cleanupTagsForKey(key);
        this.removeFromPrefixMap(key);
      },
    });

    this.nodeId = generateUUID();
  }

  // ── Metrics & Logging ───────────────────────────────────────────────────

  private async getMetrics() {
    if (this._metrics) return this._metrics;
    try {
      const { metricsService } = await import("@src/services/observability/metrics-service");
      this._metrics = metricsService;
    } catch {
      this._metrics = { recordMetric: () => {} };
    }
    return this._metrics;
  }

  private recordMetricSync(name: string, value: number) {
    if (this._metrics && typeof this._metrics.recordMetric === "function") {
      this._metrics.recordMetric(name, value);
    }
  }

  private recordLatency(ms: number) {
    this.latencyBuffer.push(ms);
    if (this.latencyBuffer.length > this.MAX_LATENCY_SAMPLES) {
      this.latencyBuffer.shift();
    }
  }

  // ── Tag & Prefix Management ─────────────────────────────────────────────

  private cleanupTagsForKey(key: string) {
    if (this._isBulkClearing) return;
    const tags = this.keyToTags.get(key);
    if (tags) {
      for (const tag of tags) {
        const keySet = this.tagMap.get(tag);
        if (keySet) {
          keySet.delete(key);
          if (keySet.size === 0) this.tagMap.delete(tag);
        }
      }
      this.keyToTags.delete(key);
    }
  }

  private normalizeTenantId(tenantId?: string | null): string {
    if (tenantId === undefined || tenantId === null || tenantId === "") return "default";
    return String(tenantId);
  }

  private scopeTag(tag: string, tenantId?: string | null): string {
    return `${this.normalizeTenantId(tenantId)}:${tag}`;
  }

  private registerTagsForKey(fullKey: string, tags: string[], tenantId?: string | null): void {
    if (!tags.length) return;
    const tagSet = this.keyToTags.get(fullKey) || new Set<string>();
    for (const tag of tags) {
      const scoped = this.scopeTag(tag, tenantId);
      if (!this.tagMap.has(scoped)) this.tagMap.set(scoped, new Set());
      this.tagMap.get(scoped)!.add(fullKey);
      tagSet.add(scoped);
    }
    this.keyToTags.set(fullKey, tagSet);
  }

  /**
   * Extracts the 2-level namespace bucket for O(1) pattern clearing.
   * e.g. "tenant:default:collection:posts:1" -> "tenant:default:collection"
   * Flat keys (no third colon, e.g. "tenant:global:theme:x") bucket under the
   * tenant namespace — otherwise each becomes its own bucket and every
   * clearByPattern misses, falling back to a full L1 scan.
   */
  private getNamespaceBucketKey(key: string): string {
    const firstColon = key.indexOf(":");
    if (firstColon === -1) return key;
    const secondColon = key.indexOf(":", firstColon + 1);
    if (secondColon === -1) return key;
    const thirdColon = key.indexOf(":", secondColon + 1);
    if (thirdColon === -1) return key.slice(0, secondColon);
    return key.slice(0, thirdColon);
  }

  private addToPrefixMap(key: string) {
    const bucketKey = this.getNamespaceBucketKey(key);
    let bucket = this.prefixMap.get(bucketKey);
    if (!bucket) {
      bucket = new Set();
      this.prefixMap.set(bucketKey, bucket);
    }
    bucket.add(key);
  }

  private removeFromPrefixMap(key: string) {
    if (this._isBulkClearing) return;
    const bucketKey = this.getNamespaceBucketKey(key);
    const bucket = this.prefixMap.get(bucketKey);
    if (bucket) {
      bucket.delete(key);
      if (bucket.size === 0) this.prefixMap.delete(bucketKey);
    }
  }

  // ── L2 Redis Lifecycle & Edge Sync ──────────────────────────────────────

  private isL2Ready(): boolean {
    return Boolean(this.l2 && this.l2.isOpen);
  }

  /**
   * Raw L2 Redis client (WAF rate limiters + security counters).
   * Returns null when Redis is not configured/connected.
   */
  getRedisClient() {
    return this.l2;
  }

  /**
   * Global per-tenant cache version — bumped by incrementGlobalVersion so
   * monitoring/health surfaces can detect cache-wide invalidations.
   */
  async getGlobalVersion(tenantId: string | null = "global"): Promise<number> {
    const key = `cms:${tenantId || "global"}:version`;
    const cached = await this.get<number>(key, tenantId);
    return cached || 1;
  }

  async incrementGlobalVersion(tenantId: string | null = "global"): Promise<number> {
    const key = `cms:${tenantId || "global"}:version`;
    const current = await this.getGlobalVersion(tenantId);
    const next = current + 1;
    await this.set(key, next, 0, tenantId); // 0 = default TTL
    await this.publishInvalidation(key, tenantId);
    return next;
  }

  async initialize(config?: any) {
    if (config === true || !config) {
      const { loadPrivateConfig } = await import("@src/databases/db");
      config = await loadPrivateConfig();
    }
    this.getMetrics().catch(() => {});
    return this.initializeL2(config);
  }

  async reconfigure(config?: any) {
    if (config?.USE_REDIS) {
      await this.initializeL2(config);
    } else {
      await this.cleanup();
    }
    return true;
  }

  async initializeL2(config: any) {
    const { isBenchmarkRedisDisabled } = await import("@utils/benchmark-runtime");
    if (isBenchmarkRedisDisabled() || !config?.USE_REDIS) {
      await this.cleanup();
      return;
    }

    try {
      const { createClient } = await import("redis");
      const redisUrl = `redis://${config.REDIS_HOST}:${config.REDIS_PORT}`;
      const redisOptions = {
        url: redisUrl,
        password: config.REDIS_PASSWORD,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries: number) =>
            retries > 3 ? new Error("Redis connection failed") : 1000,
        },
        disableOfflineQueue: true,
      };

      if (this.l2) await this.l2.destroy().catch(() => {});
      this.l2 = createClient(redisOptions);
      this.l2.on("error", (err: any) => logger.error("Redis L2 Error:", err.message));
      await this.l2
        .connect()
        .catch((err: any) => logger.error("❌ L2 Cache Connection Failed", err.message));

      if (this.subscriber) await this.subscriber.destroy().catch(() => {});
      this.subscriber = createClient(redisOptions);
      this.subscriber.on("error", (err: any) =>
        logger.error("Redis Subscriber Error:", err.message),
      );
      await this.subscriber
        .connect()
        .catch((err: any) => logger.error("❌ Redis Subscriber Failed", err.message));

      await this.subscribeToInvalidations();
      logger.info("📡 L2 Cache (Redis) & Edge-Sync subscriber initialized");
    } catch (err) {
      logger.error("❌ L2 Cache Initialization Failed", err);
      await this.cleanup();
    }
  }

  async connectL2ForTest(l2Client: any, subscriberClient?: any): Promise<void> {
    await this.cleanup();
    this.l2 = l2Client;
    this.subscriber = subscriberClient ?? l2Client;
    await this.subscribeToInvalidations();
  }

  private async subscribeToInvalidations() {
    if (!this.subscriber || !this.subscriber.isOpen) return;
    try {
      await this.subscriber.subscribe(this.INVALIDATION_CHANNEL, (message: string) => {
        try {
          const { pattern, tags, tenantId, nodeId } = JSON.parse(message);
          if (nodeId === this.nodeId) return;
          if (tags && tags.length > 0) this.clearLocalL1ByTags(tags, tenantId);
          if (pattern) this.clearLocalL1ByPattern(pattern, tenantId);
        } catch (err) {
          logger.error("[CacheSync] Failed to process invalidation message:", err);
        }
      });
    } catch (err) {
      logger.error("[CacheSync] Failed to subscribe to invalidation channel:", err);
    }
  }

  public async publishInvalidation(
    pattern: string | null,
    tenantId: string | null = "*",
    tags?: string[],
  ) {
    if (!this.isL2Ready()) {
      this.triggerCdnPurge(pattern, tags);
      return;
    }
    try {
      const message = JSON.stringify({
        pattern,
        tags,
        tenantId,
        nodeId: this.nodeId,
        timestamp: Date.now(),
      });
      await this.l2.publish(this.INVALIDATION_CHANNEL, message);
      this.triggerCdnPurge(pattern, tags);
    } catch (err) {
      logger.error("[CacheSync] Failed to publish invalidation:", err);
    }
  }

  private async triggerCdnPurge(pattern: string | null, tags?: string[]) {
    if (this._cdnResolved && !this._cdnActive) return;
    try {
      if (!this._cdnResolved) {
        const { CdnService: CdnSvc } = await import("@src/services/cdn/cdn-service");
        const cdnInst = await CdnSvc.getInstance();
        this._cdnActive = (cdnInst as any).active === true;
        this._cdnResolved = true;
        if (!this._cdnActive) return;
      }
      const { CdnService } = await import("@src/services/cdn/cdn-service");
      const cdn = await CdnService.getInstance();
      if (tags && tags.length > 0) await cdn.purge({ tags });
      else if (pattern) await cdn.purge({ everything: true });
    } catch (err) {
      this._cdnResolved = true;
      this._cdnActive = false;
      logger.trace("[CacheSync] CDN purge skipped or failed:", err);
    }
  }

  // ── Core Read Operations ────────────────────────────────────────────────

  setBootstrapping(val: boolean) {
    this.bootstrapping = val;
  }

  isBootstrapping(): boolean {
    return this.bootstrapping;
  }

  public generateKey(key: string, tenantId?: string | null): string {
    return this.buildKey(key, tenantId);
  }

  private buildKey(key: string, tenantId?: string | null): string {
    if (!tenantId || tenantId === "default") {
      return `tenant:default:${key}`;
    }
    return `tenant:${tenantId}:${key}`;
  }

  public isNegativeHit(key: string, tenantId?: string | null): boolean {
    const fullKey = this.generateKey(key, tenantId);
    return this.negative.isNegativeHit(fullKey);
  }

  public recordMiss(key: string, tenantId?: string | null) {
    const fullKey = this.generateKey(key, tenantId);
    this.negative.recordMiss(fullKey);
    this.locks.releaseLock(this.l2, fullKey).catch(() => {});
  }

  getSync<T>(key: string, tenantId?: string | null): T | null {
    const fullKey = this.generateKey(key, tenantId);
    const l1Value = this.l1.get(fullKey, { updateAgeOnGet: false });
    if (l1Value !== undefined) {
      this.stats.hits++;
      this.stats.l1Hits++;
      return l1Value as T;
    }
    return null;
  }

  async get<T>(
    key: string,
    tenantId?: string | null,
    _category?: CacheCategory,
  ): Promise<T | null | undefined> {
    const fullKey = this.generateKey(key, tenantId);

    // 1. Fast Path: L1 Cache Hit (Sync)
    const l1Value = this.l1.get(fullKey);
    if (l1Value !== undefined) {
      this.stats.hits++;
      this.stats.l1Hits++;
      this.recordMetricSync("cache:hit:l1", 1);
      cacheMetrics.recordHit(fullKey, _category || CacheCategory.GENERAL, tenantId, 0);
      return l1Value as T;
    }

    // 2. Negative Cache Hit
    if (this.negative.isNegativeHit(fullKey)) {
      this.stats.hits++;
      cacheMetrics.recordHit(fullKey, _category || CacheCategory.GENERAL, tenantId, 0);
      return null;
    }

    // 3. Single-flight Coalescing
    return this.locks.coalesce(fullKey, async () => {
      let lockOwner: string | null = null;
      if (this.isL2Ready()) {
        try {
          const start = performance.now();
          const l2Value = await this.l2.get(fullKey);
          if (l2Value) {
            const parsed = deserializeL2Value(l2Value);
            const responseTime = performance.now() - start;
            this.recordLatency(responseTime);
            this.l1.set(fullKey, parsed);
            this.stats.hits++;
            this.stats.l2Hits++;
            this.recordMetricSync("cache:hit:l2", 1);
            cacheMetrics.recordHit(
              fullKey,
              _category || CacheCategory.GENERAL,
              tenantId,
              responseTime,
            );
            return parsed as T;
          }
        } catch (err) {
          logger.error(`L2 Cache Get Failure: ${fullKey}`, err);
        }
      }

      this.stats.misses++;
      this.recordMetricSync("cache:miss", 1);
      cacheMetrics.recordMiss(fullKey, _category || CacheCategory.GENERAL, tenantId);

      // 4. Distributed Stampede Lock Coordination
      if (this.isL2Ready()) {
        lockOwner = await this.locks.acquireLock(this.l2, fullKey, 500);
        if (!lockOwner) {
          await this.locks.waitForCache(this.l1, this.l2, fullKey, 1000, deserializeL2Value);
          const recheckVal = this.l1.get(fullKey);
          if (recheckVal !== undefined) return recheckVal as T;
        }
      }

      return undefined;
    });
  }

  async coalesceQuery<T>(key: string, queryFn: () => Promise<T>): Promise<T> {
    return this.locks.coalesce(key, queryFn);
  }

  async getMany<T>(keys: string[], tenantId?: string | null): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    const fullKeys = keys.map((k) => this.generateKey(k, tenantId));
    const results: (T | null)[] = Array.from({ length: keys.length }, () => null);
    const missingIndices: number[] = [];
    const missingKeys: string[] = [];

    for (let i = 0; i < fullKeys.length; i++) {
      const l1Value = this.l1.get(fullKeys[i]);
      if (l1Value !== undefined) {
        results[i] = l1Value as T;
        this.stats.hits++;
        this.stats.l1Hits++;
      } else {
        missingIndices.push(i);
        missingKeys.push(fullKeys[i]);
      }
    }

    if (missingKeys.length === 0 || !this.isL2Ready()) return results;

    const start = performance.now();
    try {
      const l2Values = await this.l2.mGet(missingKeys);
      for (let i = 0; i < l2Values.length; i++) {
        const val = l2Values[i];
        if (val) {
          const parsed = deserializeL2Value(val);
          results[missingIndices[i]] = parsed as T;
          this.l1.set(missingKeys[i], parsed);
          this.stats.hits++;
          this.stats.l2Hits++;
        } else {
          this.stats.misses++;
        }
      }
      this.recordLatency(performance.now() - start);
    } catch (err) {
      logger.error("[CacheService] L2 mGet Failure:", err);
    }

    return results;
  }

  // ── Core Write Operations ───────────────────────────────────────────────

  async set(
    key: string,
    value: any,
    ttl = 0,
    tenantId?: string | null,
    _category = CacheCategory.GENERAL,
    tags: string[] = [],
  ): Promise<void> {
    const fullKey = this.generateKey(key, tenantId);
    const effectiveTTL =
      ttl > 0 ? ttl : (CATEGORY_TTL_SECONDS[_category] ?? CATEGORY_TTL_SECONDS.general ?? 300);

    this.l1.set(fullKey, value, { ttl: effectiveTTL * 1000 });
    this.negative.invalidate(fullKey);
    this.addToPrefixMap(fullKey);
    cacheMetrics.recordSet(fullKey, _category, effectiveTTL, tenantId);

    if (tags.length > 0) {
      this.registerTagsForKey(fullKey, tags, tenantId);
    }

    if (this.isL2Ready()) {
      try {
        const valStr = serializeL2Value(value);
        const tagPrefix = `${this.normalizeTenantId(tenantId)}:`;
        await this.batcher.bufferWrite(this.l2, {
          key: fullKey,
          val: valStr,
          ttl: effectiveTTL,
          tags,
          tagPrefix,
        });
      } catch (err) {
        logger.error(`L2 Cache Set Failure: ${fullKey}`, err);
      }
    }

    this.locks.releaseLock(this.l2, fullKey).catch(() => {});
  }

  setSync(
    key: string,
    value: any,
    ttl = 0,
    tenantId?: string | null,
    _category = CacheCategory.GENERAL,
    tags: string[] = [],
  ): void {
    const fullKey = this.generateKey(key, tenantId);
    const effectiveTTL =
      ttl > 0 ? ttl : (CATEGORY_TTL_SECONDS[_category] ?? CATEGORY_TTL_SECONDS.general ?? 300);

    this.l1.set(fullKey, value, { ttl: effectiveTTL * 1000 });
    this.negative.invalidate(fullKey);
    this.addToPrefixMap(fullKey);
    if (tags.length > 0) {
      this.registerTagsForKey(fullKey, tags, tenantId);
    }
  }

  async setMany(
    entries: { key: string; value: any; ttl?: number; tags?: string[] }[],
    tenantId?: string | null,
    category = CacheCategory.GENERAL,
  ): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttl, tenantId, category, entry.tags);
    }
  }

  // ── SWR (Stale-While-Revalidate) ─────────────────────────────────────────

  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number,
    tenantId?: string | null,
    category?: CacheCategory,
    tags: string[] = [],
  ): Promise<T> {
    const cached = await this.get<T>(key, tenantId, category);
    if (cached !== undefined && cached !== null) return cached;

    return this.locks.coalesce(`fetch:${this.generateKey(key, tenantId)}`, async () => {
      const data = await fetchFn();
      if (data !== undefined && data !== null) {
        await this.set(key, data, ttl, tenantId, category, tags);
      } else {
        this.recordMiss(key, tenantId);
      }
      return data;
    });
  }

  async getOrSetSWR<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl = 60_000,
    staleTtl = 300_000,
    tenantId?: string | null,
    _category = CacheCategory.GENERAL,
    tags: string[] = [],
  ): Promise<T> {
    const fullKey = this.generateKey(key, tenantId);
    let cachedEntry = this.l1.get(fullKey);

    // L2 Read-through for SWR
    if (!cachedEntry && this.isL2Ready()) {
      try {
        const l2Val = await this.l2.get(fullKey);
        if (l2Val) {
          cachedEntry = typeof l2Val === "string" ? JSON.parse(l2Val) : l2Val;
          this.l1.set(fullKey, cachedEntry, { ttl: staleTtl * 2 });
        }
      } catch {}
    }

    if (cachedEntry && typeof cachedEntry === "object" && "storedAt" in cachedEntry) {
      const age = Date.now() - cachedEntry.storedAt;
      if (age < ttl) {
        this.stats.hits++;
        this.stats.l1Hits++;
        return cachedEntry.value as T;
      }
      if (age < staleTtl) {
        this.stats.hits++;
        this.stats.l1Hits++;
        // Background SWR refresh
        this.locks.coalesce(`swr:refresh:${fullKey}`, async () => {
          try {
            const fresh = await fetchFn();
            if (fresh !== undefined && fresh !== null) {
              const entry = { value: fresh, storedAt: Date.now() };
              this.l1.set(fullKey, entry, { ttl: staleTtl * 2 });
              if (this.isL2Ready()) {
                await this.l2.set(fullKey, JSON.stringify(entry), {
                  EX: Math.max(1, Math.ceil(staleTtl / 1000)),
                });
              }
            }
          } catch {}
        });
        return cachedEntry.value as T;
      }
    }

    return this.locks.coalesce(`swr:miss:${fullKey}`, async () => {
      const data = await fetchFn();
      if (data !== undefined && data !== null) {
        const entry = { value: data, storedAt: Date.now() };
        this.l1.set(fullKey, entry, { ttl: staleTtl * 2 });
        this.addToPrefixMap(fullKey);
        if (tags.length > 0) this.registerTagsForKey(fullKey, tags, tenantId);
        if (this.isL2Ready()) {
          await this.l2.set(fullKey, JSON.stringify(entry), {
            EX: Math.max(1, Math.ceil(staleTtl / 1000)),
          });
        }
      } else {
        this.recordMiss(key, tenantId);
      }
      return data;
    });
  }

  // ── Deletion & Invalidation ─────────────────────────────────────────────

  async delete(key: string, tenantId?: string | null): Promise<boolean> {
    const fullKey = this.generateKey(key, tenantId);
    this.l1.delete(fullKey);
    this.cleanupTagsForKey(fullKey);
    this.removeFromPrefixMap(fullKey);
    this.negative.invalidate(fullKey);
    this.stats.deletes++;

    if (this.isL2Ready()) {
      try {
        await this.l2.del(fullKey);
        await this.publishInvalidation(key, tenantId, [key]);
      } catch (err) {
        logger.error(`L2 Cache Delete Failure: ${fullKey}`, err);
      }
    }
    return true;
  }

  private clearLocalL1ByTags(tags: string[], tenantId: string | null) {
    this._isBulkClearing = true;
    const deletedKeys: string[] = [];
    const isWildcard =
      tenantId === "*" || tenantId === undefined || tenantId === null || tenantId === "";
    const tid = isWildcard ? null : this.normalizeTenantId(tenantId);
    const tenantKeyPrefix = tid ? `tenant:${tid}:` : null;

    for (const tag of tags) {
      const candidates: string[] = [];
      if (tid) {
        candidates.push(this.scopeTag(tag, tid));
        if (this.tagMap.has(tag)) candidates.push(tag);
      } else {
        const suffix = `:${tag}`;
        for (const k of this.tagMap.keys()) {
          if (k === tag || k.endsWith(suffix)) candidates.push(k);
        }
      }

      for (const scoped of new Set(candidates)) {
        const keys = this.tagMap.get(scoped);
        if (!keys) continue;
        const keep = new Set<string>();
        for (const key of keys) {
          if (tenantKeyPrefix && !key.startsWith(tenantKeyPrefix)) {
            keep.add(key);
            continue;
          }
          this.l1.delete(key);
          deletedKeys.push(key);
        }
        if (keep.size === 0) {
          this.tagMap.delete(scoped);
        } else {
          this.tagMap.set(scoped, keep);
        }
      }
    }
    this._isBulkClearing = false;
    for (let i = 0; i < deletedKeys.length; i++) {
      this.cleanupTagsForKey(deletedKeys[i]);
      this.removeFromPrefixMap(deletedKeys[i]);
    }
  }

  async clearByTags(tags: string[], tenantId: string | null = "*") {
    if (!tags || tags.length === 0) return;
    this.clearLocalL1ByTags(tags, tenantId);
    cacheMetrics.recordClear(tags.join(","), CacheCategory.GENERAL, tenantId);

    if (this.isL2Ready()) {
      try {
        const isWildcardTenant =
          tenantId === "*" || tenantId === undefined || tenantId === null || tenantId === "";
        if (isWildcardTenant) {
          for (const tag of tags) {
            const match = `tag:*:${tag}`;
            let cursor = "0";
            do {
              const reply = await this.l2.scan(cursor, { MATCH: match, COUNT: 200 });
              cursor = reply.cursor;
              const found: string[] = reply.keys ?? [];
              for (const tagKey of found) {
                const members = await this.l2.sMembers(tagKey);
                if (members?.length > 0) await this.l2.del(members);
                await this.l2.del(tagKey);
              }
            } while (cursor !== "0");
          }
        } else {
          const tagPrefix = `${this.normalizeTenantId(tenantId)}:`;
          if (typeof this.l2.multi === "function") {
            const multi = this.l2.multi();
            for (const tag of tags) {
              const tagKey = `tag:${tagPrefix}${tag}`;
              const keys = await this.l2.sMembers(tagKey);
              if (keys?.length > 0) multi.del(keys);
              multi.del(tagKey);
            }
            await multi.exec();
          } else {
            for (const tag of tags) {
              const tagKey = `tag:${tagPrefix}${tag}`;
              const keys = await this.l2.sMembers(tagKey);
              if (keys?.length > 0) await this.l2.del(keys);
              await this.l2.del(tagKey);
            }
          }
        }
        await this.publishInvalidation(null, tenantId, tags);
      } catch (err) {
        logger.error(`L2 Cache ClearByTags Failure: ${tags.join(",")}`, err);
      }
    }
  }

  private clearLocalL1ByPattern(pattern: string, tenantId: string | null) {
    const isWildcardTenant =
      tenantId === "*" || tenantId === undefined || tenantId === null || tenantId === "";

    this._isBulkClearing = true;
    const deletedKeys: string[] = [];

    try {
      if (isWildcardTenant) {
        const patternPrefix = pattern.replace(/[*?]+$/, "");
        for (const key of this.l1.keys()) {
          const sep = key.indexOf(":", "tenant:".length);
          if (sep === -1) continue;
          const logicalKey = key.slice(sep + 1);
          if (logicalKey.startsWith(patternPrefix)) {
            this.l1.delete(key);
            deletedKeys.push(key);
          }
        }
      } else {
        const fullPattern = this.generateKey(pattern, tenantId);
        const patternPrefix = fullPattern.replace(/[*?]+$/, "");
        const bucketKey = this.getNamespaceBucketKey(fullPattern);
        const bucket = this.prefixMap.get(bucketKey);

        if (bucket) {
          for (const key of bucket) {
            if (key.startsWith(patternPrefix)) {
              this.l1.delete(key);
              deletedKeys.push(key);
            }
          }
        } else {
          for (const key of this.l1.keys()) {
            if (key.startsWith(patternPrefix)) {
              this.l1.delete(key);
              deletedKeys.push(key);
            }
          }
        }
      }
    } finally {
      this._isBulkClearing = false;
    }

    for (let i = 0; i < deletedKeys.length; i++) {
      this.cleanupTagsForKey(deletedKeys[i]);
      this.removeFromPrefixMap(deletedKeys[i]);
    }
  }

  async clearByPattern(pattern: string, tenantId: string | null = "*") {
    this.clearLocalL1ByPattern(pattern, tenantId);
    cacheMetrics.recordClear(pattern, CacheCategory.GENERAL, tenantId);

    if (this.isL2Ready()) {
      try {
        const isWildcardTenant =
          tenantId === "*" || tenantId === undefined || tenantId === null || tenantId === "";
        const patternCore = pattern.replace(/[*?]+$/, "");
        const fullPattern = isWildcardTenant
          ? `tenant:*:${patternCore}*`
          : `${this.generateKey(patternCore, tenantId)}*`;

        let cursor = "0";
        do {
          const reply = await this.l2.scan(cursor, {
            MATCH: fullPattern,
            COUNT: 500,
          });
          cursor = reply.cursor;
          if (reply.keys.length > 0) await this.l2.del(reply.keys);
        } while (cursor !== "0");

        await this.publishInvalidation(pattern, tenantId);
      } catch (err) {
        logger.error(`L2 Cache ClearByPattern Failure: ${pattern}`, err);
      }
    }
  }

  async invalidateAll(tenantId: string | null = "*") {
    this.l1.clear();
    this.tagMap.clear();
    this.keyToTags.clear();
    this.prefixMap.clear();
    this.negative.clear();
    this.locks.clear();

    if (this.isL2Ready()) {
      await this.l2.flushAll();
      await this.publishInvalidation("*", tenantId);
    }
  }

  async invalidateByCategory(category: CacheCategory, tenantId: string | null = "*") {
    await this.clearByPattern(`*:${category}:`, tenantId);
  }

  async invalidateCollection(collection: string, tenantId: string | null = "*") {
    await this.clearByPattern(`collection:${collection}:`, tenantId);
  }

  // ── Observability & Stats ───────────────────────────────────────────────

  getStats(): CacheStats {
    return {
      ...this.stats,
      l1Size: this.l1.size,
      size: this.l1.size,
    };
  }

  getLatencyStats(): { avg: number; p95: number; p99: number; samples: number } {
    if (this.latencyBuffer.length === 0) {
      return { avg: 0, p95: 0, p99: 0, samples: 0 };
    }
    const sorted = [...this.latencyBuffer].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const avg = sum / sorted.length;
    const p95Idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
    const p99Idx = Math.min(Math.floor(sorted.length * 0.99), sorted.length - 1);
    return {
      avg: Math.round(avg * 1000) / 1000,
      p95: Math.round(sorted[p95Idx] * 1000) / 1000,
      p99: Math.round(sorted[p99Idx] * 1000) / 1000,
      samples: sorted.length,
    };
  }

  async cleanup(): Promise<void> {
    await this.batcher.flush(this.l2);
    this.batcher.clear();
    this.negative.stop();
    this.locks.clear();

    if (this.subscriber) {
      try {
        await this.subscriber.unsubscribe();
        await this.subscriber.destroy();
      } catch {}
      this.subscriber = null;
    }

    if (this.l2) {
      try {
        await this.l2.destroy();
      } catch {}
      this.l2 = null;
    }
  }

  async destroy(): Promise<void> {
    await this.cleanup();
    this.l1.clear();
    this.tagMap.clear();
    this.keyToTags.clear();
    this.prefixMap.clear();
  }
}

export const cacheService = new CacheService();
export default cacheService;
