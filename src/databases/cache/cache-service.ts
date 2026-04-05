/**
 * @file src/databases/cache/cache-service.ts
 * @description Enterprise Hybrid Caching Service (L1 Memory + L2 Redis).
 *
 * This implementation provides:
 * 1. L1 (In-Memory): Near-zero latency for hot data, process-local.
 * 2. L2 (Redis): Shared state across instances, persistent, large capacity.
 * 3. Automatic Backfilling: L2 hits replenish L1.
 * 4. High-Performance Keys: Memoized tenant-aware key generation.
 * 5. Debounced Tags: Optimized bulk-invalidation for high-throughput content.
 */

import { getPrivateSettingSync } from "@src/services/settings-service";
import { logger } from "@utils/logger";
import type { RedisClientType } from "redis";
import { InMemoryStore } from "./inmemory-store";
import { RedisStore } from "./redis-store";
import { CacheCategory, type WarmCacheConfig, type PrefetchPattern } from "./types";

// Re-export for convenience
export { CacheCategory };

// Environment detection
const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";
const isTest =
  typeof process !== "undefined" && (process.env.VITEST === "true" || !!(globalThis as any).vi);

// Default constants
export const SESSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const USER_PERM_CACHE_TTL_MS = 60 * 1000;
export const USER_COUNT_CACHE_TTL_MS = 5 * 60 * 1000;
export const API_CACHE_TTL_MS = 5 * 60 * 1000;
export const SESSION_CACHE_TTL_S = Math.ceil(SESSION_CACHE_TTL_MS / 1000);
export const USER_PERM_CACHE_TTL_S = Math.ceil(USER_PERM_CACHE_TTL_MS / 1000);
export const USER_COUNT_CACHE_TTL_S = Math.ceil(USER_COUNT_CACHE_TTL_MS / 1000);
export const API_CACHE_TTL_S = Math.ceil(API_CACHE_TTL_MS / 1000);
export const REDIS_TTL_S = 300;

const DEFAULT_CATEGORY_TTLS: Record<CacheCategory, number> = {
  [CacheCategory.SCHEMA]: 600,
  [CacheCategory.WIDGET]: 600,
  [CacheCategory.THEME]: 300,
  [CacheCategory.CONTENT]: 180,
  [CacheCategory.MEDIA]: 300,
  [CacheCategory.SESSION]: 86_400,
  [CacheCategory.USER]: 60,
  [CacheCategory.API]: 300,
  [CacheCategory.COLLECTION]: 600,
  [CacheCategory.ENTRY]: 180,
  [CacheCategory.SETTING]: 3600,
};

function getCategoryTTL(category: CacheCategory): number {
  const configKey = `CACHE_TTL_${category.toUpperCase()}` as any;
  try {
    const configuredTTL = getPrivateSettingSync(configKey);
    if (typeof configuredTTL === "number" && configuredTTL > 0) return configuredTTL;
  } catch {
    // Silent fallback
  }
  return DEFAULT_CATEGORY_TTLS[category];
}

export class CacheService {
  private static instance: CacheService;
  private l1: InMemoryStore; // L1: Local In-Memory (Zero-latency hit)
  private l2: RedisStore | null = null; // L2: Shared Redis (Cross-instance sync)
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private bootstrapping = true;
  private readonly prefetchPatterns: PrefetchPattern[] = [];
  private readonly keyCache = new Map<string, string>(); // Memoized keys
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly accessLog = new Map<string, number[]>(); // Track access times for analytics

  constructor() {
    this.l1 = new InMemoryStore();
  }

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  setBootstrapping(val: boolean): void {
    this.bootstrapping = val;
    if (!val) {
      logger.info("CacheService: Bootstrapping complete. L1/L2 Hybrid active.");
    }
  }

  isBootstrapping(): boolean {
    return this.bootstrapping;
  }

  async initialize(force = false): Promise<void> {
    if (this.initialized && !force) return;
    if (!this.initPromise || force) {
      this.initPromise = (async () => {
        try {
          const USE_REDIS = getPrivateSettingSync("USE_REDIS");
          const isRedisEnabled = !isBrowser && !isTest && USE_REDIS === true;

          // Always initialize L1
          await this.l1.initialize();

          // Initialize L2 if enabled
          if (isRedisEnabled) {
            const config = {
              USE_REDIS: true,
              URL: `redis://${getPrivateSettingSync("REDIS_HOST") || "localhost"}:${getPrivateSettingSync("REDIS_PORT") || 6379}`,
              PASSWORD: getPrivateSettingSync("REDIS_PASSWORD") || undefined,
              RETRY_ATTEMPTS: 3,
              RETRY_DELAY: 2000,
            };
            this.l2 = new RedisStore(config);
            await this.l2.initialize();
          }

          this.initialized = true;
          logger.info(
            `CacheService: L1 Memory initialized. L2 Redis: ${isRedisEnabled ? "Active" : "Disabled"}.`,
          );
        } catch (error) {
          logger.error("CacheService hybrid initialization failed:", error);
          this.initPromise = null;
          throw error;
        }
      })();
    }
    return this.initPromise;
  }

  async reconfigure(): Promise<void> {
    this.initialized = false;
    return this.initialize(true);
  }

  private async ensureInitialized() {
    if (!this.initialized) await this.initialize();
  }

  private generateKey(baseKey: string, tenantId?: string | null): string {
    const requested = `${baseKey}:${tenantId || "none"}`;
    const memoed = this.keyCache.get(requested);
    if (memoed) return memoed;

    let result: string;
    const isMultiTenant = getPrivateSettingSync("MULTI_TENANT");

    if (baseKey.startsWith("tenant:")) {
      result = baseKey;
    } else if (isMultiTenant) {
      result = `tenant:${tenantId || "default"}:${baseKey}`;
    } else {
      result = baseKey;
    }

    if (this.keyCache.size < 5000) this.keyCache.set(requested, result);
    return result;
  }

  async get<T>(
    baseKey: string,
    tenantId?: string | null,
    category?: CacheCategory,
  ): Promise<T | null> {
    await this.ensureInitialized();
    const key = this.generateKey(baseKey, tenantId);

    // 1. Try L1 (Memory) - Ultra fast
    const hot = await this.l1.get<T>(key);
    if (hot !== null) {
      this.trackAccess(key);
      return hot;
    }

    // 2. Try L2 (Redis) + Backfill L1
    if (this.l2) {
      const cold = await this.l2.get<T>(key);
      if (cold !== null) {
        this.trackAccess(key);
        const ttl = category ? getCategoryTTL(category) : REDIS_TTL_S;
        void this.l1.set(key, cold, ttl); // Async backfill
        return cold;
      }
    }

    return null;
  }

  private trackAccess(key: string): void {
    const now = Date.now();
    const accesses = this.accessLog.get(key) || [];
    accesses.push(now);
    if (accesses.length > 100) accesses.shift();
    this.accessLog.set(key, accesses);
  }

  async warmCache(config: WarmCacheConfig): Promise<void> {
    await this.ensureInitialized();
    logger.info(`Cache: Warming category ${config.category} with ${config.keys.length} keys`);
    try {
      const data = await config.fetcher();
      const ttl = config.category ? getCategoryTTL(config.category) : REDIS_TTL_S;
      for (const key of config.keys) {
        await this.set(key, data, ttl, config.tenantId, config.category);
      }
    } catch (error) {
      logger.error("Cache: Warming failed", error);
    }
  }

  registerPrefetchPattern(pattern: PrefetchPattern): void {
    this.prefetchPatterns.push(pattern);
    logger.debug(`Cache: Registered prefetch for: ${pattern.category}`);
  }

  async set<T>(
    baseKey: string,
    value: T,
    ttlSeconds: number,
    tenantId?: string | null,
    category?: CacheCategory,
    tags?: string[],
  ): Promise<void> {
    await this.ensureInitialized();
    const key = this.generateKey(baseKey, tenantId);
    const ttl = category && ttlSeconds === 0 ? getCategoryTTL(category) : ttlSeconds;

    // Set globally/shared (L2) and locally (L1)
    await Promise.all([
      this.l1.set(key, value, ttl, tags),
      this.l2 ? this.l2.set(key, value, ttl, tags) : Promise.resolve(),
    ]);
  }

  async setWithCategory<T>(
    baseKey: string,
    value: T,
    category: CacheCategory,
    tenantId?: string | null,
    tags?: string[],
  ): Promise<void> {
    const ttl = getCategoryTTL(category);
    return this.set(baseKey, value, ttl, tenantId, category, tags);
  }

  async delete(baseKey: string | string[], tenantId?: string | null): Promise<void> {
    await this.ensureInitialized();
    const keys = Array.isArray(baseKey)
      ? baseKey.map((k) => this.generateKey(k, tenantId))
      : this.generateKey(baseKey, tenantId);

    await Promise.all([this.l1.delete(keys), this.l2 ? this.l2.delete(keys) : Promise.resolve()]);
  }

  async clearByPattern(pattern: string, tenantId?: string | null): Promise<void> {
    await this.ensureInitialized();
    const keyPattern = this.generateKey(pattern, tenantId);

    await Promise.all([
      this.l1.clearByPattern(keyPattern),
      this.l2 ? this.l2.clearByPattern(keyPattern) : Promise.resolve(),
    ]);
  }

  async clearByTags(tags: string[] | string, tenantId?: string | null): Promise<void> {
    await this.ensureInitialized();
    const tagsArray = Array.isArray(tags) ? tags : [tags];
    const isMultiTenant = getPrivateSettingSync("MULTI_TENANT");

    const finalTags = !isMultiTenant
      ? tagsArray
      : tagsArray.map((t) =>
          t.startsWith("tenant:") ? t : `tenant:${tenantId || "default"}:${t}`,
        );

    const debounceKey = finalTags.sort().join(",");

    if (this.debounceTimers.has(debounceKey)) {
      clearTimeout(this.debounceTimers.get(debounceKey)!);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(debounceKey);
      await Promise.all([
        this.l1.clearByTags(finalTags),
        this.l2 ? this.l2.clearByTags(finalTags) : Promise.resolve(),
      ]);
      if (!this.bootstrapping)
        logger.debug(`Cache: Bulk tag invalidation executed for: ${debounceKey}`);
    }, 300);

    this.debounceTimers.set(debounceKey, timer);
  }

  async invalidateAll(tenantId?: string | null): Promise<void> {
    await this.ensureInitialized();
    const isMultiTenant = getPrivateSettingSync("MULTI_TENANT");
    const pattern = isMultiTenant && tenantId ? `tenant:${tenantId}:*` : "*";

    await this.clearByPattern(pattern);
    logger.info(`Cache: Full invalidation completed for scope: ${pattern}`);
  }

  getRedisClient(): RedisClientType | null {
    return this.l2 ? this.l2.getClient() : null;
  }

  async disconnect(): Promise<void> {
    await Promise.all([this.l1.disconnect(), this.l2 ? this.l2.disconnect() : Promise.resolve()]);
  }
}

export const cacheService = CacheService.getInstance();
