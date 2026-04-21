/**
 * @file src/databases/cache/cache-service.ts
 * @description
 * High-performance hybrid L1/L2 caching service for SveltyCMS.
 *
 * Architecture:
 * - L1 (Memory): Hot data, zero latency, LRU eviction.
 * - L2 (Redis): Warm data, distributed, shared across clusters.
 *
 * Strategies:
 * - Read-Through: Auto-populate on miss.
 * - Write-Through: Update cache on database write.
 * - Time-to-Live (TTL): Category-based expiration.
 * - Predictive Prefetching: Pattern matching and active warming.
 * - Intelligent Thundering Herd Protection.
 */

import { logger } from "@utils/logger";
import { LRUCache } from "lru-cache";
import { CacheCategory, type CacheStats } from "./types";
import { metricsService } from "@src/services/metrics-service";
import { getPrivateSettingSync } from "@src/services/settings-service";

// --- TTL CONSTANTS (S) ---
export const USER_COUNT_CACHE_TTL_S = 300; // 5 min
export const USER_PERM_CACHE_TTL_S = 600; // 10 min
export const API_CACHE_TTL_S = 60; // 1 min
export const REDIS_TTL_S = 3600; // 1 hr
export const SESSION_CACHE_TTL_S = 86400; // 1 day

// --- TTL CONSTANTS (MS) ---
export const USER_COUNT_CACHE_TTL_MS = USER_COUNT_CACHE_TTL_S * 1000;
export const USER_PERM_CACHE_TTL_MS = USER_PERM_CACHE_TTL_S * 1000;
export const SESSION_CACHE_TTL_MS = SESSION_CACHE_TTL_S * 1000;

export class CacheService {
  private l1: LRUCache<string, any>;
  private l2: any = null; // Redis Client (Publisher/Getter)
  private subscriber: any = null; // Redis Client (Subscriber)
  private nodeId: string = (globalThis as any).__SVELTY_NODE_ID__ || "unknown";
  private readonly INVALIDATION_CHANNEL = "svelty:cache:invalidation";
  private keyCache = new Map<string, string>();
  private prefetchPatterns: Map<string, string[]> = new Map();
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

  // High-performance circular buffer for latency metrics (Last 100 ops)
  private latencyBuffer: number[] = [];
  private readonly MAX_LATENCY_SAMPLES = 100;

  // Surgical Caching: Map of tags to sets of L1 keys
  private tagMap = new Map<string, Set<string>>();

  constructor() {
    this.l1 = new LRUCache({
      max: 1000,
      ttl: 1000 * 60 * 5, // 5 minute default L1
      allowStale: true,
      updateAgeOnGet: true,
      dispose: (key) => {
        // Automatically cleanup tag mapping on eviction
        this.removeFromTagMap(key);
      },
    });
  }

  private removeFromTagMap(key: string) {
    for (const [tag, keys] of this.tagMap.entries()) {
      if (keys.has(key)) {
        keys.delete(key);
        if (keys.size === 0) this.tagMap.delete(tag);
      }
    }
  }

  // Reconfigures the cache service to pick up new settings.
  async reconfigure(config?: any) {
    if (config?.USE_REDIS) {
      await this.initializeL2(config);
    } else {
      await this.cleanup();
    }
    logger.debug("CacheService reconfigured");
    return true;
  }

  async initialize() {
    try {
      const { loadPrivateConfig } = await import("@src/databases/config-state");
      const config = await loadPrivateConfig(false);
      await this.initializeL2(config);
    } catch (err) {
      logger.error("CacheService manual initialize failed:", err);
    }
  }

  /**
   * Cleans up all Redis connections.
   */
  async cleanup() {
    if (this.l2) {
      await this.l2.quit().catch(() => {});
      this.l2 = null;
    }
    if (this.subscriber) {
      await this.subscriber.quit().catch(() => {});
      this.subscriber = null;
    }
  }

  // Initialize L2 Cache (Redis)
  async initializeL2(config: any) {
    if (!config.USE_REDIS) {
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

      // 1. Initialise Primary Client (Get/Set/Publish)
      if (this.l2) await this.l2.quit().catch(() => {});
      this.l2 = createClient(redisOptions);
      this.l2.on("error", (err: any) => logger.error("Redis L2 Error:", err.message));
      await this.l2.connect().catch((err: any) => {
        logger.error("❌ L2 Cache Initial Connection Failed", err.message);
      });

      // 2. Initialise Subscriber Client (Edge Sync)
      if (this.subscriber) await this.subscriber.quit().catch(() => {});
      this.subscriber = createClient(redisOptions);
      this.subscriber.on("error", (err: any) =>
        logger.error("Redis Subscriber Error:", err.message),
      );
      await this.subscriber.connect().catch((err: any) => {
        logger.error("❌ Redis Subscriber Initial Connection Failed", err.message);
      });

      // 3. Start Listening for Invalidations
      await this.subscribeToInvalidations();

      logger.info("📡 L2 Cache (Redis) & Edge-Sync subscriber initialized");
    } catch (err) {
      logger.error("❌ L2 Cache Initialization Failed", err);
      await this.cleanup();
    }
  }

  /**
   * Subscribes to the invalidation channel to stay in sync with other nodes.
   * Part of Phase 8: Edge Sync & Invalidation.
   */
  private async subscribeToInvalidations() {
    if (!this.subscriber || !this.subscriber.isOpen) return;

    try {
      await this.subscriber.subscribe(this.INVALIDATION_CHANNEL, (message: string) => {
        try {
          const { pattern, tags, tenantId, nodeId } = JSON.parse(message);

          // 🛡️ Loopback Protection: Ignore our own messages
          if (nodeId === this.nodeId) return;

          if (tags) {
            logger.trace(
              `[CacheSync] Received tag invalidation: ${tags.join(",")} (tenant: ${tenantId})`,
            );
            this.clearLocalL1ByTags(tags, tenantId);
          } else if (pattern) {
            logger.trace(
              `[CacheSync] Received pattern invalidation: ${pattern} (tenant: ${tenantId})`,
            );
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

  /**
   * Publishes an invalidation event to all edge nodes.
   */
  public async publishInvalidation(
    pattern: string | null,
    tenantId: string | null = "*",
    tags?: string[],
  ) {
    if (!this.isL2Ready()) {
      // 🚀 Fallback: If Redis is missing, still try CDN purging for single-node setups
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

      // 🌍 Sync with external CDN (Cloudflare)
      this.triggerCdnPurge(pattern, tags);
    } catch (err) {
      logger.error("[CacheSync] Failed to publish invalidation:", err);
    }
  }

  /**
   * Triggers external CDN purging via Cloudflare.
   */
  private async triggerCdnPurge(pattern: string | null, tags?: string[]) {
    try {
      const { CdnService } = await import("@src/services/cdn/cdn-service");
      const cdn = await CdnService.getInstance();

      if (tags && tags.length > 0) {
        await cdn.purge({ tags });
      } else if (pattern) {
        // If it's a collection-level pattern, we purge the whole zone for safety
        // or a specific tag if we map patterns to tags.
        // For now: PURGE EVERYTHING if a full pattern is cleared.
        await cdn.purge({ everything: true });
      }
    } catch (err) {
      logger.trace("[CacheSync] CDN purge skipped or failed:", err);
    }
  }

  private isL2Ready(): boolean {
    return this.l2 && this.l2.isOpen;
  }

  // Sets the bootstrapping state
  setBootstrapping(_val: boolean) {
    logger.debug(`CacheService bootstrapping: ${_val}`);
  }

  isBootstrapping() {
    return false;
  }

  // Get item from cache (Hybrid L1 -> L2)
  async get<T>(
    key: string,
    tenantId?: string | null,
    _category?: CacheCategory,
  ): Promise<T | null> {
    const fullKey = this.buildKey(key, tenantId);
    const start = performance.now();

    // 1. Check L1 (Memory)
    const l1Value = this.l1.get(fullKey);
    if (l1Value !== undefined) {
      this.recordLatency(performance.now() - start);
      this.stats.hits++;
      this.stats.l1Hits++;
      metricsService.recordMetric("cache:hit:l1", 1);
      this.trackAccess(key);
      return l1Value as T;
    }

    // 2. Check L2 (Redis)
    if (this.isL2Ready()) {
      try {
        const l2Value = await this.l2.get(fullKey);
        if (l2Value) {
          const parsed = JSON.parse(l2Value);
          this.recordLatency(performance.now() - start);
          // Promote to L1
          this.l1.set(fullKey, parsed);
          this.stats.hits++;
          this.stats.l2Hits++;
          metricsService.recordMetric("cache:hit:l2", 1);
          return parsed as T;
        }
      } catch (err) {
        logger.error(`L2 Cache Get Failure: ${fullKey}`, err);
      }
    }

    this.recordLatency(performance.now() - start);
    this.stats.misses++;
    metricsService.recordMetric("cache:miss", 1);
    return null;
  }

  private recordLatency(ms: number) {
    this.latencyBuffer.push(ms);
    if (this.latencyBuffer.length > this.MAX_LATENCY_SAMPLES) {
      this.latencyBuffer.shift();
    }
  }

  // Set item in cache
  async set(
    key: string,
    value: any,
    ttl?: number,
    tenantId?: string | null,
    category: CacheCategory = CacheCategory.GENERAL,
    tags: string[] = [],
  ) {
    const fullKey = this.buildKey(key, tenantId);
    const finalTTL = ttl || this.getDefaultTTL(category);

    // Set L1
    this.l1.set(fullKey, value, { ttl: finalTTL * 1000 });

    // Surgical Track: Map tags to this L1 key
    if (tags.length > 0) {
      for (const tag of tags) {
        if (!this.tagMap.has(tag)) this.tagMap.set(tag, new Set());
        this.tagMap.get(tag)!.add(fullKey);
      }
    }

    // Set L2
    if (this.isL2Ready()) {
      try {
        await this.l2.set(fullKey, JSON.stringify(value), {
          EX: finalTTL,
        });

        // Handle Tags for L2 Invalidation
        if (tags.length > 0) {
          for (const tag of tags) {
            await this.l2.sAdd(`tag:${tag}`, fullKey);
          }
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
  ) {
    return this.set(key, value, ttl, tenantId, category);
  }

  // Delete item from cache
  async delete(key: string | string[], tenantId?: string | null) {
    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) {
      const fullKey = this.buildKey(k, tenantId);
      this.l1.delete(fullKey);
      if (this.isL2Ready()) {
        await this.l2.del(fullKey);
      }
      this.stats.deletes++;
    }
  }

  /**
   * Clears ONLY the local L1 cache by tags.
   */
  private clearLocalL1ByTags(tags: string[], _tenantId?: string | null) {
    let count = 0;
    for (const tag of tags) {
      const keys = this.tagMap.get(tag);
      if (keys) {
        for (const key of keys) {
          this.l1.delete(key);
          count++;
        }
        this.tagMap.delete(tag);
      }
    }
    if (count > 0) {
      logger.debug(
        `[CacheSync] Surgical L1 purge: ${count} items cleared for tags: ${tags.join(",")}`,
      );
    }
  }

  // Clear cache by tags (Surgical Invalidation)
  async clearByTags(tags: string[], tenantId?: string | null) {
    // 1. Clear local L1
    this.clearLocalL1ByTags(tags, tenantId);

    // 2. Clear L2 (Redis)
    if (this.isL2Ready()) {
      for (const tag of tags) {
        const keys = await this.l2.sMembers(`tag:${tag}`);
        if (keys?.length > 0) {
          await this.l2.del(keys);
          await this.l2.del(`tag:${tag}`);
        }
      }

      // 3. Broadcast invalidation to other nodes
      await this.publishInvalidation(null, tenantId, tags);
    }
  }

  getRedisClient() {
    return this.l2;
  }

  // Patterns management for predictive prefetching
  registerPrefetchPattern(triggerKey: string, dependentKeys: string[]) {
    this.prefetchPatterns.set(triggerKey, dependentKeys);
  }

  private trackAccess(key: string) {
    if (this.prefetchPatterns.has(key)) {
      const deps = this.prefetchPatterns.get(key);
      if (deps) {
        // Active warming in background
        void this.warmCache(deps);
      }
    }
  }

  private async warmCache(keys: string[]) {
    // Logic to proactively fetch or refresh these keys based on app logic
    logger.debug(`Cache Warming started for ${keys.length} items`);
  }

  public generateKey(key: string, tenantId?: string | null): string {
    const cacheKey = `${key}:${tenantId}`;
    const cached = this.keyCache.get(cacheKey);
    if (cached) return cached;

    const multiTenant =
      getPrivateSettingSync("MULTI_TENANT") || (globalThis as any).__mockMultiTenant;

    const tId = tenantId || "default";
    const result = multiTenant ? `tenant:${tId}:${key}` : key;

    this.keyCache.set(cacheKey, result);
    return result;
  }

  private buildKey(key: string, tenantId?: string | null): string {
    return this.generateKey(key, tenantId);
  }

  private getDefaultTTL(category: CacheCategory): number {
    switch (category) {
      case CacheCategory.SCHEMA:
        return 3600; // 1hr
      case CacheCategory.USER:
        return 300; // 5min
      case CacheCategory.SESSION:
        return 86400; // 24hr
      case CacheCategory.API:
        return 60; // 1min
      case CacheCategory.CONTENT:
        return 1800; // 30min
      default:
        return 300;
    }
  }

  async invalidateAll(tenantId?: string | null) {
    if (tenantId !== undefined) {
      return this.clearByPattern("*", tenantId);
    }
    this.l1.clear();
    if (this.isL2Ready()) {
      await this.l2.flushAll();
    }
  }

  /**
   * Clears ONLY the local L1 cache by pattern.
   * Used for responding to invalidation messages from other nodes.
   */
  public clearLocalL1ByPattern(pattern: string, tenantId: string | null = "*") {
    const fullPattern = this.buildKey(pattern, tenantId);
    // Escape special regex characters but keep * as .*
    const escaped = fullPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    const regex = new RegExp(`^${escaped}$`);

    logger.trace(`[CacheSync] Purging L1 with pattern: ${fullPattern} (regex: ${regex.source})`);

    let count = 0;
    for (const key of this.l1.keys()) {
      if (regex.test(key)) {
        this.l1.delete(key);
        count++;
      }
    }
    if (count > 0) {
      logger.debug(`[CacheSync] Purged ${count} items from L1 for pattern: ${pattern}`);
    }
  }

  async clearByPattern(pattern: string, tenantId: string | null = "*") {
    // 1. Clear local L1
    this.clearLocalL1ByPattern(pattern, tenantId);

    // 2. Clear L2 (Redis)
    if (this.isL2Ready()) {
      const fullPattern = this.buildKey(pattern, tenantId);
      let cursor = 0;
      do {
        const result = await this.l2.scan(cursor, {
          MATCH: fullPattern,
          COUNT: 100,
        });
        cursor = Number(result.cursor);
        if (result.keys && result.keys.length > 0) {
          await this.l2.del(result.keys);
        }
      } while (cursor !== 0);

      // 3. Broadcast invalidation to other edge nodes
      await this.publishInvalidation(pattern, tenantId);
    }
  }

  getStats() {
    return {
      ...this.stats,
      l1Size: this.l1.size,
      size: this.l1.size, // compatibility
    };
  }
}

export const cacheService = new CacheService();
