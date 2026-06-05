/**
 * @file src/databases/cache/cache-service.ts
 * @description High-performance hybrid L1/L2 caching service for SveltyCMS.
 */

import { logger } from "@utils/logger";
import { LRUCache } from "lru-cache";
import { CacheCategory, type CacheStats } from "./types";
import { BloomFilter } from "@utils/bloom-filter";
import { cacheMetrics } from "./cache-metrics";

// --- EXPORTED CONSTANTS (API Compatibility) ---
export const API_CACHE_TTL_S = 300;
export const SESSION_CACHE_TTL_MS = 86400000;
export const USER_PERM_CACHE_TTL_MS = 3600000;
export const USER_PERM_CACHE_TTL_S = 3600;
export const USER_COUNT_CACHE_TTL_MS = 3600000;
export const USER_COUNT_CACHE_TTL_S = 3600;

export class CacheService {
  private l1: LRUCache<string, any>;
  private l2: any = null;
  private subscriber: any = null;
  private nodeId: string;
  private readonly INVALIDATION_CHANNEL = "svelty:cache:invalidation";
  private tagMap: Map<string, Set<string>> = new Map();
  private keyToTags: Map<string, Set<string>> = new Map(); // Reverse mapping for O(tags) cleanup
  private keyCache: LRUCache<string, string>; // Memoization for generated keys
  private prefixMap: Map<string, Set<string>> = new Map(); // Buckets for O(1) pattern clearing

  // Single-flight request coalescing
  private pendingRequests = new Map<string, Promise<any>>();

  // 🚀 DISTRIBUTED CACHE STAMPEDE PROTECTION: Lock registry for inter-node coordination
  private lockedKeys = new Map<string, Promise<boolean>>();

  // 🚀 HYBRID NEGATIVE CACHE (Memory Optimized)
  private negativeBloom: BloomFilter;
  private negativeInvalidated: Set<string>; // Tiny set for immediate overrides
  private negativeRotationTimer: any;

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

  constructor() {
    this.l1 = new LRUCache<string, any>({
      max: 500000,
      ttl: 1000 * 60 * 5,
      dispose: (_value: any, key: string) => {
        this.cleanupTagsForKey(key);
        this.removeFromPrefixMap(key);
      },
    });

    this.keyCache = new LRUCache<string, string>({ max: 1000 });

    // Initialize Hybrid Negative Cache
    this.negativeBloom = new BloomFilter(100000, 0.01);
    this.negativeInvalidated = new Set<string>();
    this.startNegativeCacheRotation();

    this.nodeId = globalThis.crypto ? globalThis.crypto.randomUUID() : Math.random().toString(36);
  }

  private startNegativeCacheRotation() {
    if (this.negativeRotationTimer) clearInterval(this.negativeRotationTimer);
    // Rotate the bloom filter every 5 minutes to prevent stale data accumulation
    this.negativeRotationTimer = setInterval(
      () => {
        this.negativeBloom = new BloomFilter(100000, 0.01);
        this.negativeInvalidated.clear();
      },
      1000 * 60 * 5,
    );

    // Allow the process to exit even if the timer is running (Crucial for test runners)
    if (typeof this.negativeRotationTimer.unref === "function") {
      this.negativeRotationTimer.unref();
    }
  }

  // Lazy Metrics Service
  private _metrics: any = null;
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

  // Fast Metrics (Sync if available)
  private recordMetricSync(name: string, value: number) {
    if (this._metrics && typeof this._metrics.recordMetric === "function") {
      this._metrics.recordMetric(name, value);
    }
  }

  private cleanupTagsForKey(key: string) {
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

  async reconfigure(config?: any) {
    if (config?.USE_REDIS) {
      await this.initializeL2(config);
    } else {
      await this.cleanup();
    }
    return true;
  }

  async initialize(config?: any) {
    if (config === true || !config) {
      const { loadPrivateConfig } = await import("@src/databases/db");
      config = await loadPrivateConfig();
    }
    // Pre-warm metrics for sync recording
    this.getMetrics().catch(() => {});
    return this.initializeL2(config);
  }

  async initializeL2(config: any) {
    if (!config?.USE_REDIS) {
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
        .catch((err: any) => logger.error("❌ L2 Cache Initial Connection Failed", err.message));

      if (this.subscriber) await this.subscriber.destroy().catch(() => {});
      this.subscriber = createClient(redisOptions);
      this.subscriber.on("error", (err: any) =>
        logger.error("Redis Subscriber Error:", err.message),
      );
      await this.subscriber
        .connect()
        .catch((err: any) =>
          logger.error("❌ Redis Subscriber Initial Connection Failed", err.message),
        );

      await this.subscribeToInvalidations();
      logger.info("📡 L2 Cache (Redis) & Edge-Sync subscriber initialized");
    } catch (err) {
      logger.error("❌ L2 Cache Initialization Failed", err);
      await this.cleanup();
    }
  }

  private async subscribeToInvalidations() {
    if (!this.subscriber || !this.subscriber.isOpen) return;

    try {
      await this.subscriber.subscribe(this.INVALIDATION_CHANNEL, (message: string) => {
        try {
          const { pattern, tags, tenantId, nodeId } = JSON.parse(message);
          if (nodeId === this.nodeId) return;

          if (tags && tags.length > 0) {
            this.clearLocalL1ByTags(tags, tenantId);
          } else if (pattern) {
            this.clearLocalL1ByPattern(pattern, tenantId);
          }
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
    try {
      const { CdnService } = await import("@src/services/cdn/cdn-service");
      const cdn = await CdnService.getInstance();
      if (tags && tags.length > 0) await cdn.purge({ tags });
      else if (pattern) await cdn.purge({ everything: true });
    } catch (err) {
      logger.trace("[CacheSync] CDN purge skipped or failed:", err);
    }
  }

  private isL2Ready(): boolean {
    return this.l2 && this.l2.isOpen;
  }

  /**
   * Attempts to acquire a distributed cache miss lock using the L2 adapter (Redis).
   * This prevents a cache stampede by serializing access to expensive fetch operations.
   * @param key The full cache key to lock.
   * @param ttlMs Lock time-to-live in milliseconds.
   * @returns The owner ID if lock acquired, or null if lock is already held or L2 unavailable.
   */
  private async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    if (!this.isL2Ready()) return null;

    const lockKey = `lock:${key}`;
    const ownerId = globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).substring(2);

    try {
      // SET lockKey ownerId NX PX ttlMs
      const result = await this.l2.set(lockKey, ownerId, {
        NX: true,
        PX: ttlMs,
      });
      if (result !== "OK") return null;

      this.lockedKeys.set(lockKey, Promise.resolve(true));
      return ownerId;
    } catch (err) {
      logger.error(`[CacheService] Failed to acquire lock for ${key}`, err);
      return null;
    }
  }

  /**
   * Releases a cache miss lock that was previously acquired.
   * Safe to call even if lock wasn't acquired — simply no-ops.
   * @param key The full cache key to unlock.
   * @param ownerId The owner ID returned by `acquireLock`.
   */
  private async releaseLock(key: string, ownerId: string): Promise<void> {
    if (!ownerId || !this.isL2Ready()) return;

    const lockKey = `lock:${key}`;

    try {
      // Only delete if the current value matches our owner ID (prevents premature release)
      const currentOwner = await this.l2.get(lockKey);
      if (currentOwner === ownerId) {
        await this.l2.del(lockKey);
      }
    } catch (err) {
      logger.error(`[CacheService] Failed to release lock for ${key}`, err);
    } finally {
      this.lockedKeys.delete(lockKey);
    }
  }

  /**
   * Polls the L1 cache until the winning process has populated the value,
   * or until the maximum wait time expires.
   * @param key The full cache key to wait for.
   * @param maxWaitMs Maximum time to wait in milliseconds.
   */
  private async waitForCache(key: string, maxWaitMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (this.l1.has(key)) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  setBootstrapping(_val: boolean) {
    this.bootstrapping = _val;
    if (process.env.NODE_ENV === "development") logger.debug(`CacheService bootstrapping: ${_val}`);
  }

  isBootstrapping(): boolean {
    return this.bootstrapping;
  }

  async get<T>(
    key: string,
    tenantId?: string | null,
    _category?: CacheCategory,
  ): Promise<T | null | undefined> {
    const fullKey = this.generateKey(key, tenantId);

    // 🚀 FAST PATH: Check L1 memory cache (Sync)
    const l1Value = this.l1.get(fullKey);
    if (l1Value !== undefined) {
      this.stats.hits++;
      this.stats.l1Hits++;
      this.recordMetricSync("cache:hit:l1", 1);
      cacheMetrics.recordHit(fullKey, _category || CacheCategory.GENERAL, tenantId, 0);
      return l1Value as T;
    }

    // 0. Check Negative Cache (Bloom)
    if (!this.negativeInvalidated.has(fullKey) && this.negativeBloom.has(fullKey)) {
      this.stats.hits++;
      cacheMetrics.recordHit(fullKey, _category || CacheCategory.GENERAL, tenantId, 0);
      return null;
    }

    // Single-flight: coalesce concurrent misses
    if (this.pendingRequests.has(fullKey)) {
      return this.pendingRequests.get(fullKey);
    }

    const promise = (async () => {
      let lockOwner: string | null = null;

      try {
        // 🚀 L2 PATH: If L1 miss, query Redis
        if (this.isL2Ready()) {
          try {
            const start = performance.now();
            const l2Value = await this.l2.get(fullKey);
            if (l2Value) {
              let parsed: any;
              if (typeof l2Value === "string" && l2Value.startsWith("__RAW_STRING__:")) {
                parsed = l2Value.substring(15);
              } else {
                parsed = typeof l2Value === "string" ? JSON.parse(l2Value) : l2Value;
              }

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

        // 🚀 DISTRIBUTED STAMPEDE PROTECTION
        // Attempt to acquire a lock to prevent thundering herd on the same key.
        // If lock is NOT acquired, wait briefly for the winning process to populate the cache.
        if (this.isL2Ready()) {
          lockOwner = await this.acquireLock(fullKey, 500); // 500ms TTL
          if (!lockOwner) {
            // Another request is already fetching this key. Wait for it.
            await this.waitForCache(fullKey, 1000); // Wait up to 1s
          }
          // If we acquired the lock, the caller is responsible for populating the cache.
          // The lock will be released:
          //   a) When the caller calls set() which triggers releaseMissLock below, OR
          //   b) Automatically after TTL expires (500ms fallback)
        }

        return null;
      } finally {
        // 🛡️ CRITICAL: If we acquired a lock but returned undefined (miss),
        // the external caller will populate the cache via set(). We defer
        // lock release to there. But if THIS request doesn't call set(),
        // the lock will naturally expire after TTL.
        // Mark the lock as pending release via the promise's completion.
        if (lockOwner) {
          this.pendingRequests.set(`lockrelease:${fullKey}`, Promise.resolve(lockOwner));
        }
      }
    })();

    this.pendingRequests.set(fullKey, promise);
    promise.finally(() => this.pendingRequests.delete(fullKey));
    return promise;
  }

  /**
   * High-performance synchronous L1 cache lookup.
   * Bypasses async micro-task overhead for "hot" items.
   */
  getSync<T>(key: string, tenantId?: string | null): T | null {
    const fullKey = this.generateKey(key, tenantId);
    const l1Value = this.l1.get(fullKey);
    if (l1Value !== undefined) {
      this.stats.hits++;
      this.stats.l1Hits++;
      this.recordMetricSync("cache:hit:l1", 1);
      cacheMetrics.recordHit(fullKey, CacheCategory.GENERAL, tenantId, 0);
      return l1Value as T;
    }
    return null;
  }

  async getMany<T>(keys: string[], tenantId?: string | null): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    const fullKeys = keys.map((k) => this.generateKey(k, tenantId));
    const results: (T | null)[] = Array.from({ length: keys.length }, () => null);
    const missingIndices: number[] = [];
    const missingKeys: string[] = [];

    const start = performance.now();

    // 1. Try L1 First
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

    if (missingKeys.length === 0) {
      this.recordLatency(performance.now() - start);
      return results;
    }

    // 2. Try L2 (Redis MGET)
    if (this.isL2Ready()) {
      const pendingKey = `mget:${missingKeys.join(",")}`;
      if (this.pendingRequests.has(pendingKey)) {
        const resolvedResults = await this.pendingRequests.get(pendingKey);
        for (let i = 0; i < missingIndices.length; i++) {
          results[missingIndices[i]] = resolvedResults[i];
        }
        this.recordLatency(performance.now() - start);
        return results;
      }

      const promise = (async () => {
        try {
          const resolvedResults = Array(missingKeys.length).fill(null);
          const l2Values = await this.l2.mGet(missingKeys);
          for (let i = 0; i < l2Values.length; i++) {
            const val = l2Values[i];
            if (val) {
              let parsed: any;
              if (typeof val === "string" && val.startsWith("__RAW_STRING__:")) {
                parsed = val.substring(15);
              } else {
                parsed = JSON.parse(val);
              }
              resolvedResults[i] = parsed;
              const originalIndex = missingIndices[i];
              results[originalIndex] = parsed as T;
              this.l1.set(missingKeys[i], parsed);
              this.stats.hits++;
              this.stats.l2Hits++;
            } else {
              this.stats.misses++;
            }
          }
          return resolvedResults;
        } catch (err) {
          logger.error("L2 Cache MGet Failure", err);
          return Array(missingKeys.length).fill(null);
        }
      })();

      this.pendingRequests.set(pendingKey, promise);
      promise.finally(() => this.pendingRequests.delete(pendingKey));
      await promise;
    } else {
      this.stats.misses += missingKeys.length;
    }

    this.recordLatency(performance.now() - start);
    return results;
  }

  async set(
    key: string,
    value: any,
    ttl = 300,
    tenantId: string | null = "global",
    _category = CacheCategory.GENERAL,
    tags: string[] = [],
  ): Promise<void> {
    const fullKey = this.generateKey(key, tenantId);
    const finalTTL = ttl > 0 ? ttl : 300;

    this.l1.set(fullKey, value, { ttl: finalTTL * 1000 });
    this.negativeInvalidated.add(fullKey); // Override bloom filter
    this.addToPrefixMap(fullKey);
    cacheMetrics.recordSet(fullKey, _category, finalTTL, tenantId);

    if (tags.length > 0) {
      const tagSet = this.keyToTags.get(fullKey) || new Set();
      for (const tag of tags) {
        if (!this.tagMap.has(tag)) this.tagMap.set(tag, new Set());
        this.tagMap.get(tag)!.add(fullKey);
        tagSet.add(tag);
      }
      this.keyToTags.set(fullKey, tagSet);
    }

    if (this.isL2Ready()) {
      try {
        const valStr =
          typeof value === "string" ? `__RAW_STRING__:${value}` : JSON.stringify(value);
        await this.l2.set(fullKey, valStr, { EX: finalTTL });
        if (tags.length > 0 && typeof this.l2.multi === "function") {
          const multi = this.l2.multi();
          for (const tag of tags) multi.sAdd(`tag:${tag}`, fullKey);
          await multi.exec();
        }
      } catch (err) {
        logger.error(`L2 Cache Set Failure: ${fullKey}`, err);
      }
    }

    // 🚀 STAMPEDE LOCK RELEASE: If a miss-lock was acquired for this key,
    // release it immediately since the cache is now populated
    const lockReleaseKey = `lockrelease:${fullKey}`;
    const pendingLock = this.pendingRequests.get(lockReleaseKey);
    if (pendingLock) {
      this.pendingRequests.delete(lockReleaseKey);
      pendingLock.then((ownerId) => {
        if (ownerId) this.releaseLock(fullKey, ownerId).catch(() => {});
      });
    }
  }

  async setWithCategory(
    key: string,
    value: any,
    category: CacheCategory,
    tenantId?: string | null,
    ttl?: number,
    tags?: string[],
  ): Promise<void> {
    return this.set(key, value, ttl, tenantId, category, tags);
  }

  /**
   * ✨ ARCHITECTURAL PLACEHOLDER: Registers patterns for predictive pre-warming.
   * Part of the "Agency OS" predictive caching roadmap.
   */
  registerPrefetchPattern(_trigger: string, _dependencies: string[]) {
    // Logic for predictive pre-warming will be fully implemented in v1.2
    if (process.env.NODE_ENV === "development") {
      logger.debug(`[PredictiveCache] Registered prefetch trigger: ${_trigger}`);
    }
  }

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

  async delete(key: string | string[], tenantId?: string | null): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) {
      const fullKey = this.generateKey(k, tenantId);
      this.l1.delete(fullKey);
      this.negativeInvalidated.add(fullKey); // Override bloom filter
      cacheMetrics.recordDelete(fullKey, CacheCategory.GENERAL, tenantId);
      if (this.isL2Ready()) {
        try {
          await this.l2.del(fullKey);
        } catch (err) {
          logger.error(`L2 Cache Delete Failure: ${fullKey}`, err);
        }
      }
    }
    await this.publishInvalidation(null, tenantId, keys);
  }

  async clearByTags(tags: string[], tenantId: string | null = "*"): Promise<void> {
    this.clearLocalL1ByTags(tags, tenantId);
    for (const tag of tags) {
      cacheMetrics.recordClear(`tag:${tag}`, CacheCategory.GENERAL, tenantId);
    }
    if (this.isL2Ready()) {
      try {
        if (typeof this.l2.multi === "function") {
          const multi = this.l2.multi();
          for (const tag of tags) {
            const tagKey = `tag:${tag}`;
            const keys = await this.l2.sMembers(tagKey);
            if (keys?.length > 0) multi.del(keys);
            multi.del(tagKey);
          }
          await multi.exec();
        } else {
          // Fallback for non-redis L2 or restricted clients
          for (const tag of tags) {
            const tagKey = `tag:${tag}`;
            const keys = await this.l2.sMembers(tagKey);
            if (keys?.length > 0) await this.l2.del(keys);
            await this.l2.del(tagKey);
          }
        }
        await this.publishInvalidation(null, tenantId, tags);
      } catch (err) {
        logger.error(`L2 Cache ClearByTags Failure: ${tags.join(",")}`, err);
      }
    }
  }

  async clearByPattern(pattern: string, tenantId: string | null = "*") {
    this.clearLocalL1ByPattern(pattern, tenantId);
    cacheMetrics.recordClear(pattern, CacheCategory.GENERAL, tenantId);
    if (this.isL2Ready()) {
      try {
        const fullPattern = this.generateKey(pattern, tenantId) + "*";
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

  /**
   * Generates a consistent cache key, memoized for performance.
   */
  public generateKey(key: string, tenantId?: string | null): string {
    const tid = tenantId || "default";
    const cacheLookupKey = `${key}:${tid}`;

    const cached = this.keyCache.get(cacheLookupKey);
    if (cached) return cached;

    const fullKey = this.buildKey(key, tenantId);
    this.keyCache.set(cacheLookupKey, fullKey);
    return fullKey;
  }

  /**
   * Records a confirmed cache miss (Negative Cache).
   * Prevents repeated DB hits for non-existent items.
   */
  public recordMiss(key: string, tenantId?: string | null) {
    const fullKey = this.generateKey(key, tenantId);
    this.negativeBloom.add(fullKey);
  }

  private buildKey(key: string, tenantId: string | null = "default"): string {
    // Check for MULTI_TENANT setting (memoized in settings-service sync)
    // We import it dynamically if needed, but for sync core performance we check global context if available
    const isMultiTenant = (globalThis as any).__mockMultiTenant ?? false;

    if (isMultiTenant) {
      return `tenant:${tenantId || "default"}:${key}`;
    }

    return key;
  }

  private clearLocalL1ByTags(tags: string[], _tenantId: string | null) {
    for (const tag of tags) {
      const keys = this.tagMap.get(tag);
      if (keys) {
        for (const key of Array.from(keys)) this.l1.delete(key);
        this.tagMap.delete(tag);
      }
    }
  }

  private addToPrefixMap(key: string) {
    const segments = key.split(":");
    let currentPrefix = "";
    // Store ALL prefix levels for pattern matching (not just 3)
    // Also store single-segment fallback for flat keys (e.g., "bench-key-0")
    for (let i = 0; i < segments.length; i++) {
      currentPrefix += (i > 0 ? ":" : "") + segments[i];
      if (!this.prefixMap.has(currentPrefix)) {
        this.prefixMap.set(currentPrefix, new Set());
      }
      this.prefixMap.get(currentPrefix)!.add(key);
    }
    // Fallback: also index by first 8 chars for flat keys without colons
    if (segments.length === 1 && key.length > 8) {
      const shortPrefix = key.substring(0, 8);
      if (!this.prefixMap.has(shortPrefix)) {
        this.prefixMap.set(shortPrefix, new Set());
      }
      this.prefixMap.get(shortPrefix)!.add(key);
    }
  }

  private _isBulkClearing = false;

  private removeFromPrefixMap(key: string) {
    if (this._isBulkClearing) return;

    // Remove all prefix levels (same levels added by addToPrefixMap)
    const segments = key.split(":");

    // Colon-separated prefixes
    let currentPrefix = "";
    for (let i = 0; i < segments.length; i++) {
      currentPrefix += (i > 0 ? ":" : "") + segments[i];
      const bucket = this.prefixMap.get(currentPrefix);
      if (bucket) {
        bucket.delete(key);
        if (bucket.size === 0) this.prefixMap.delete(currentPrefix);
      }
    }

    // Flat key fallback (first 8 chars, added by addToPrefixMap for keys without colons)
    if (segments.length === 1 && key.length > 8) {
      const shortPrefix = key.substring(0, 8);
      const bucket = this.prefixMap.get(shortPrefix);
      if (bucket) {
        bucket.delete(key);
        if (bucket.size === 0) this.prefixMap.delete(shortPrefix);
      }
    }
  }

  private clearLocalL1ByPattern(pattern: string, tenantId: string | null) {
    const fullPattern = this.generateKey(pattern, tenantId);

    // 🚀 PREFIX MAP FAST PATH: Find the deepest matching bucket and scan only its keys.
    // Instead of O(N) scan over all 500k L1 keys, we narrow to the bucket that
    // contains all matching keys. For pattern "api:userId:bench", we look up
    // bucket "api:userId" and scan only those keys (typically <1000).
    const segments = fullPattern.split(":");
    let bestBucket: Set<string> | undefined;

    // Walk from longest prefix to shortest to find the best bucket
    for (let i = segments.length - 1; i >= 0; i--) {
      const prefix = segments.slice(0, i + 1).join(":");
      const bucket = this.prefixMap.get(prefix);
      if (bucket && bucket.size > 0) {
        bestBucket = bucket;
        break;
      }
    }

    // 🚀 FALLBACK: For flat keys without colons, try first-8-char prefix lookup
    if (!bestBucket && segments.length === 1 && fullPattern.length > 8) {
      bestBucket = this.prefixMap.get(fullPattern.substring(0, 8));
    }

    if (bestBucket) {
      // O(bucket) scan instead of O(all)
      this._isBulkClearing = true;
      try {
        // Strip glob characters (*, ?) for prefix matching — generateKey
        // preserves them literally, but startsWith needs the prefix only
        const matchPrefix = fullPattern.replace(/[*?]+$/, "");
        const keys = Array.from(bestBucket);
        for (let i = 0; i < keys.length; i++) {
          if (keys[i].startsWith(matchPrefix)) {
            this.l1.delete(keys[i]);
          }
        }
      } finally {
        this._isBulkClearing = false;
      }
      // Clean up empty buckets
      for (let i = segments.length - 1; i >= 0; i--) {
        const prefix = segments.slice(0, i + 1).join(":");
        const bucket = this.prefixMap.get(prefix);
        if (bucket && bucket.size === 0) this.prefixMap.delete(prefix);
      }
      return;
    }

    // FALLBACK: Only used when no prefix bucket exists (should be rare)
    // Strip glob characters for prefix matching (same as fast path above)
    const fallbackPrefix = fullPattern.replace(/[*?]+$/, "");
    const allKeys = Array.from(this.l1.keys());
    for (let i = 0; i < allKeys.length; i++) {
      if (allKeys[i].startsWith(fallbackPrefix)) {
        this.l1.delete(allKeys[i]);
        this.removeFromPrefixMap(allKeys[i]);
      }
    }
  }

  private recordLatency(ms: number) {
    this.latencyBuffer.push(ms);
    if (this.latencyBuffer.length > this.MAX_LATENCY_SAMPLES) this.latencyBuffer.shift();
  }

  async cleanup() {
    if (this.negativeRotationTimer) {
      clearInterval(this.negativeRotationTimer);
      this.negativeRotationTimer = null;
    }
    if (this.l2) {
      if (typeof this.l2.disconnect === "function") await this.l2.disconnect().catch(() => {});
      else if (typeof this.l2.destroy === "function") await this.l2.destroy().catch(() => {});
    }
    if (this.subscriber) {
      if (typeof this.subscriber.disconnect === "function")
        await this.subscriber.disconnect().catch(() => {});
      else if (typeof this.subscriber.destroy === "function")
        await this.subscriber.destroy().catch(() => {});
    }
    this.l2 = null;
    this.subscriber = null;
    this.l1.clear();
    this.tagMap.clear();
    this.keyToTags.clear();
    this.keyCache.clear();
  }

  getRedisClient() {
    return this.l2;
  }

  getStats() {
    const avgLatency =
      this.latencyBuffer.length > 0
        ? this.latencyBuffer.reduce((a, b) => a + b, 0) / this.latencyBuffer.length
        : 0;
    const metricsSnapshot = cacheMetrics.getSnapshot();
    return {
      ...this.stats,
      hits: metricsSnapshot.hits,
      misses: metricsSnapshot.misses,
      avgLatency,
      l1Size: this.l1.size,
      tagCount: this.tagMap.size,
      byCategory: metricsSnapshot.byCategory,
      byTenant: metricsSnapshot.byTenant,
    };
  }
}

export const cacheService = new CacheService();
