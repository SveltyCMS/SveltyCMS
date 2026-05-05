/**
 * @file src/services/settings-service.ts
 * @description Server-only settings cache and management
 *
 * Features:
 * - server-side cache
 * - type-safe getters
 * - database synchronization
 * - settings import/export
 */

import { privateConfigSchema } from "../../databases/private-config-schema";
import { publicConfigSchema } from "../../databases/public-config-schema";
import { logger } from "@utils/logger";
import type { IDBAdapter } from "@src/databases/db-interface";
import type { InferOutput } from "valibot";

export type PrivateEnv = InferOutput<typeof privateConfigSchema>;
export type PublicEnv = InferOutput<typeof publicConfigSchema> & {
  PKG_VERSION?: string;
};

// Extract setting keys from schemas (single source of truth)
const KNOWN_PUBLIC_KEYS = Object.keys(publicConfigSchema.entries);

// Infrastructure keys that come from config file, not database.
const INFRASTRUCTURE_KEYS = new Set([
  "DB_TYPE",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DB_RETRY_ATTEMPTS",
  "DB_RETRY_DELAY",
  "DB_POOL_SIZE",
  "JWT_SECRET_KEY",
  "ENCRYPTION_KEY",
  "MULTI_TENANT",
  "DEMO",
  "TEST_API_SECRET",
  "PASSWORD_MIN_LENGTH",
]);

const KNOWN_PRIVATE_KEYS = Object.keys(privateConfigSchema.entries).filter(
  (key) => !INFRASTRUCTURE_KEYS.has(key),
);

// Internal server-side cache per tenant
interface SettingsCache {
  loaded: boolean;
  loadedAt: number;
  private: PrivateEnv;
  public: PublicEnv;
}

const GLOBAL_TENANT = "global";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

/**
 * Settings Management Service
 */
export class SettingsService {
  private caches = new Map<string, SettingsCache>();
  private pkgVersionPromise: Promise<string> | null = null;

  constructor() {}

  private getOrCreateCache(tenantId: string = GLOBAL_TENANT): SettingsCache {
    if (!this.caches.has(tenantId)) {
      this.caches.set(tenantId, {
        loaded: false,
        loadedAt: 0,
        private: {} as PrivateEnv,
        public: { PKG_VERSION: "0.0.0" } as PublicEnv,
      });
    }
    return this.caches.get(tenantId)!;
  }

  private async loadPkgVersion(): Promise<string> {
    if (!this.pkgVersionPromise) {
      this.pkgVersionPromise = import("../../../package.json")
        .then((pkg) => pkg.version || "0.0.0")
        .catch(() => "0.0.0");
    }
    return this.pkgVersionPromise;
  }

  /**
   * Loads settings from the database into the server-side cache.
   */
  public async loadSettingsCache(
    tenantId: string = GLOBAL_TENANT,
    overrides?: { dbAdapter: IDBAdapter; getPrivateEnv: () => PrivateEnv },
  ): Promise<SettingsCache> {
    const cache = this.getOrCreateCache(tenantId);
    const now = Date.now();

    if (cache.loaded && now - cache.loadedAt > CACHE_TTL) {
      cache.loaded = false;
      logger.debug(`Settings cache invalidated for tenant ${tenantId} (TTL expired)`);
    }

    if (cache.loaded && !overrides) {
      return cache;
    }

    try {
      const { dbAdapter, getPrivateEnv } = overrides || (await import("@src/databases/db"));

      if (!dbAdapter?.system.preferences) {
        logger.warn(
          `Database adapter not yet initialized, using empty settings cache for tenant ${tenantId}`,
        );
        cache.loaded = true;
        cache.loadedAt = Date.now();
        cache.public.PKG_VERSION = await this.loadPkgVersion();
        return cache;
      }

      const [publicResult, privateResult] = await Promise.all([
        dbAdapter.system.preferences.getMany(KNOWN_PUBLIC_KEYS, "system", tenantId as any),
        dbAdapter.system.preferences.getMany(KNOWN_PRIVATE_KEYS, "system", tenantId as any),
      ]);

      if (!publicResult.success) {
        throw new Error(
          `Failed to load public settings for tenant ${tenantId}: ${publicResult.error?.message || "Unknown error"}`,
        );
      }

      const publicSettings = publicResult.data || {};
      const privateDynamic = privateResult.success ? privateResult.data || {} : {};
      const inMemoryConfig = getPrivateEnv();

      let privateConfig: PrivateEnv;
      if (inMemoryConfig) {
        privateConfig = inMemoryConfig as any;
      } else {
        try {
          const isTest = process.env.NODE_ENV === "test" || process.env.TEST_MODE === "true";
          const configFilename = isTest ? "private.test" : "private";
          const module = await import(/* @vite-ignore */ `../../config/${configFilename}`).catch(
            () => ({}),
          );
          privateConfig = (module.privateEnv || module) as PrivateEnv;
        } catch (error) {
          logger.trace("Private config not found during setup", {
            tenantId,
            error: error instanceof Error ? error.message : String(error),
          });
          privateConfig = {} as PrivateEnv;
        }
      }

      for (const key of INFRASTRUCTURE_KEYS) {
        if (key in privateDynamic) {
          delete (privateDynamic as Record<string, unknown>)[key];
        }
      }

      let globalPublic = {};
      let globalPrivate = {};
      if (tenantId !== GLOBAL_TENANT) {
        const globalCache = await this.loadSettingsCache(GLOBAL_TENANT, overrides);
        globalPublic = globalCache.public;
        globalPrivate = globalCache.private;
      }

      const mergedPublic = { ...globalPublic, ...publicSettings };
      const mergedPrivate = Object.assign({}, globalPrivate, privateConfig, privateDynamic);

      cache.private = mergedPrivate as PrivateEnv;
      cache.public = mergedPublic as PublicEnv;
      cache.public.PKG_VERSION = await this.loadPkgVersion();
      cache.loaded = true;
      cache.loadedAt = Date.now();

      const replicas = (mergedPrivate as any).DB_REPLICA_URLS;
      if (replicas && dbAdapter.configureReplicas) {
        dbAdapter.configureReplicas(replicas);
      }

      return cache;
    } catch (error) {
      logger.error(`Failed to load settings cache for tenant ${tenantId}:`, error);
      cache.public.PKG_VERSION = await this.loadPkgVersion();
      throw error;
    }
  }

  public invalidateCache(tenantId?: string): void {
    if (tenantId) {
      this.caches.delete(tenantId);
      logger.debug(`Settings cache manually invalidated for tenant ${tenantId}`);
    } else {
      this.caches.clear();
      logger.debug("All settings caches manually invalidated");
    }
  }

  public async getPrivateSetting<K extends keyof PrivateEnv>(
    key: K,
    tenantId?: string,
  ): Promise<PrivateEnv[K]> {
    const { private: privateEnv } = await this.loadSettingsCache(tenantId);
    return privateEnv[key];
  }

  public async getPublicSetting<K extends keyof PublicEnv>(
    key: K,
    tenantId?: string,
  ): Promise<PublicEnv[K]> {
    const { public: publicEnv } = await this.loadSettingsCache(tenantId);
    return publicEnv[key];
  }

  public async getUntypedSetting<T = unknown>(
    key: string,
    scope?: "public" | "private",
    tenantId?: string,
  ): Promise<T | undefined> {
    const { public: publicEnv, private: privateEnv } = await this.loadSettingsCache(tenantId);

    if (
      (!scope || scope === "public") &&
      (publicEnv as Record<string, unknown>)[key] !== undefined
    ) {
      return (publicEnv as unknown as Record<string, T>)[key];
    }
    if (
      (!scope || scope === "private") &&
      (privateEnv as Record<string, unknown>)[key] !== undefined
    ) {
      return (privateEnv as unknown as Record<string, T>)[key];
    }
    return undefined;
  }

  public getPublicSettingSync<K extends keyof PublicEnv>(
    key: K,
    tenantId: string = GLOBAL_TENANT,
  ): PublicEnv[K] {
    return this.getOrCreateCache(tenantId).public[key];
  }

  public getPrivateSettingSync<K extends keyof PrivateEnv>(
    key: K,
    tenantId: string = GLOBAL_TENANT,
  ): PrivateEnv[K] {
    return this.getOrCreateCache(tenantId).private[key];
  }

  public async setPrivateSetting<K extends keyof PrivateEnv>(
    key: K,
    value: PrivateEnv[K],
    tenantId: string = GLOBAL_TENANT,
  ): Promise<void> {
    const { dbAdapter } = await import("@src/databases/db");
    if (!dbAdapter?.system.preferences) {
      throw new Error("Database adapter not available");
    }

    const res = await dbAdapter.system.preferences.setMany([
      { key: key as string, value, scope: "system", userId: tenantId as any },
    ]);

    if (!res.success) {
      throw new Error(res.error?.message || `Failed to update private setting: ${key as string}`);
    }

    this.invalidateCache(tenantId);
  }

  public async getAllSettings(tenantId?: string): Promise<Record<string, unknown>> {
    const { public: publicEnv, private: privateEnv } = await this.loadSettingsCache(tenantId);
    return {
      public: { ...publicEnv },
      private: { ...privateEnv },
    } as Record<string, unknown>;
  }

  public async updateSettingsFromSnapshot(
    snapshot: Record<string, unknown>,
    tenantId: string = GLOBAL_TENANT,
  ): Promise<{ updated: number }> {
    const { dbAdapter } = await import("@src/databases/db");
    if (!dbAdapter?.system.preferences) {
      throw new Error("Database adapter not available");
    }

    const snap = snapshot as any;
    const settings = snap.settings ?? snap;
    const ops: any[] = [];

    for (const [key, value] of Object.entries(settings)) {
      const v = (value as any)?.value !== undefined ? (value as any).value : value;
      ops.push({ key, value: v, scope: "system", userId: tenantId });
    }

    const res = await dbAdapter.system.preferences.setMany(ops);
    if (!res.success) {
      throw new Error(res.error?.message || "Failed to update settings");
    }

    this.invalidateCache(tenantId);
    return { updated: ops.length };
  }
}

export const settingsService = new SettingsService();

// Export convenience functions for backward compatibility
export const loadSettingsCache = settingsService.loadSettingsCache.bind(settingsService);
export const invalidateSettingsCache = settingsService.invalidateCache.bind(settingsService);
export const getPrivateSetting = settingsService.getPrivateSetting.bind(settingsService);
export const getPublicSetting = settingsService.getPublicSetting.bind(settingsService);
export const getUntypedSetting = settingsService.getUntypedSetting.bind(settingsService);
export const getPublicSettingSync = settingsService.getPublicSettingSync.bind(settingsService);
export const getPrivateSettingSync = settingsService.getPrivateSettingSync.bind(settingsService);
export const getAllSettings = settingsService.getAllSettings.bind(settingsService);
export const setPrivateSetting = settingsService.setPrivateSetting.bind(settingsService);
export const updateSettingsFromSnapshot =
  settingsService.updateSettingsFromSnapshot.bind(settingsService);
