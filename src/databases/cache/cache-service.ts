/**
 * @file src/databases/cache/cache-service.ts
 * @description High-performance hybrid L1/L2 caching service for SveltyCMS.
 */

import { logger } from "@utils/logger";
import { LRUCache } from "lru-cache";
import { CacheCategory, type CacheStats } from "./types";
import { BloomFilter } from "@utils/bloom-filter";

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

      if (this.l2) await this.l2.quit().catch(() => {});
      this.l2 = createClient(redisOptions);
      this.l2.on("error", (err: any) => logger.error("Redis L2 Error:", err.message));
      await this.l2
        .connect()
        .catch((err: any) => logger.error("❌ L2 Cache Initial Connection Failed", err.message));

      if (this.subscriber) await this.subscriber.quit().catch(() => {});
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
      return l1Value as T;
    }

    // 0. Check Negative Cache (Bloom)
    if (!this.negativeInvalidated.has(fullKey) && this.negativeBloom.has(fullKey)) {
      this.stats.hits++;
      return null;
    }

    // 🚀 L2 PATH: If L1 miss, query Redis
    if (this.isL2Ready()) {
      try {
        const start = performance.now();
        const l2Value = await this.l2.get(fullKey);
        if (l2Value) {
          const parsed = typeof l2Value === "string" ? JSON.parse(l2Value) : l2Value;

          this.recordLatency(performance.now() - start);
          this.l1.set(fullKey, parsed);
          this.stats.hits++;
          this.stats.l2Hits++;
          this.recordMetricSync("cache:hit:l2", 1);
          return parsed as T;
        }
      } catch (err) {
        logger.error(`L2 Cache Get Failure: ${fullKey}`, err);
      }
    }

    this.stats.misses++;
    this.recordMetricSync("cache:miss", 1);
    return undefined;
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
      try {
        const l2Values = await this.l2.mGet(missingKeys);
        for (let i = 0; i < l2Values.length; i++) {
          const val = l2Values[i];
          if (val) {
            const parsed = JSON.parse(val);
            const originalIndex = missingIndices[i];
            results[originalIndex] = parsed as T;
            this.l1.set(missingKeys[i], parsed);
            this.stats.hits++;
            this.stats.l2Hits++;
          } else {
            this.stats.misses++;
          }
        }
      } catch (err) {
        logger.error("L2 Cache MGet Failure", err);
      }
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
        await this.l2.set(fullKey, JSON.stringify(value), { EX: finalTTL });
        if (tags.length > 0 && typeof this.l2.multi === "function") {
          const multi = this.l2.multi();
          for (const tag of tags) multi.sAdd(`tag:${tag}`, fullKey);
          await multi.exec();
        }
      } catch (err) {
        logger.error(`L2 Cache Set Failure: ${fullKey}`, err);
      }
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
    if (this.isL2Ready()) {
      try {
        const fullPattern = this.generateKey(pattern, tenantId) + "*";
        let cursor = "0";
        do {
          const reply = await this.l2.scan(cursor, { MATCH: fullPattern, COUNT: 500 });
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
    for (let i = 0; i < Math.min(segments.length, 3); i++) {
      currentPrefix += (i > 0 ? ":" : "") + segments[i];
      if (!this.prefixMap.has(currentPrefix)) {
        this.prefixMap.set(currentPrefix, new Set());
      }
      this.prefixMap.get(currentPrefix)!.add(key);
    }
  }

  private _isBulkClearing = false;

  private removeFromPrefixMap(key: string) {
    if (this._isBulkClearing) return;

    let firstColon = key.indexOf(":");
    if (firstColon === -1) return;

    let secondColon = key.indexOf(":", firstColon + 1);
    let thirdColon = secondColon === -1 ? -1 : key.indexOf(":", secondColon + 1);

    const prefixes = [
      key.substring(0, firstColon),
      secondColon === -1 ? null : key.substring(0, secondColon),
      thirdColon === -1 ? null : key.substring(0, thirdColon),
    ];

    for (const prefix of prefixes) {
      if (!prefix) continue;
      const bucket = this.prefixMap.get(prefix);
      if (bucket) {
        bucket.delete(key);
        if (bucket.size === 0) this.prefixMap.delete(prefix);
      }
    }
  }

  private clearLocalL1ByPattern(pattern: string, tenantId: string | null) {
    const fullPattern = this.generateKey(pattern, tenantId);

    // FAST PATH: Use prefixMap if the pattern matches a bucket exactly
    /*
    const bucket = this.prefixMap.get(fullPattern);
    if (bucket) {
      // Clear the bucket efficiently
      const keys = Array.from(bucket);
      this._isBulkClearing = true;
      try {
        for (let i = 0; i < keys.length; i++) {
          this.l1.delete(keys[i]);
        }
      } finally {
        this._isBulkClearing = false;
      }
      this.prefixMap.delete(fullPattern);
      return;
    }
    */

    // FALLBACK: O(N) scan
    const allKeys = Array.from(this.l1.keys());
    for (let i = 0; i < allKeys.length; i++) {
      if (allKeys[i].startsWith(fullPattern)) {
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
    if (this.l2) await this.l2.quit().catch(() => {});
    if (this.subscriber) await this.subscriber.quit().catch(() => {});
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
    return { ...this.stats, avgLatency, l1Size: this.l1.size, tagCount: this.tagMap.size };
  }
}

export const cacheService = new CacheService();
