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

import { privateConfigSchema } from "../databases/private-config-schema";
import { publicConfigSchema } from "../databases/public-config-schema";
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
// Must match INFRASTRUCTURE_KEYS in src/databases/db.ts to prevent
// "split-brain" where DB values overwrite config/private.ts values.
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

const caches = new Map<string, SettingsCache>();
const GLOBAL_TENANT = "global";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

function getOrCreateCache(tenantId: string = GLOBAL_TENANT): SettingsCache {
  if (!caches.has(tenantId)) {
    caches.set(tenantId, {
      loaded: false,
      loadedAt: 0,
      private: {} as PrivateEnv,
      public: { PKG_VERSION: "0.0.0" } as PublicEnv,
    });
  }
  return caches.get(tenantId)!;
}

// Memoized version loader
let pkgVersionPromise: Promise<string> | null = null;
async function loadPkgVersion(): Promise<string> {
  if (!pkgVersionPromise) {
    pkgVersionPromise = import("../../package.json")
      .then((pkg) => pkg.version || "0.0.0")
      .catch(() => "0.0.0");
  }
  return pkgVersionPromise;
}

/**
 * Loads settings from the database into the server-side cache if not already loaded.
 * Cache automatically invalidates after TTL (5 minutes) to prevent stale data.
 * This is the single source of truth on the server.
 */
export async function loadSettingsCache(
  tenantId: string = GLOBAL_TENANT,
  overrides?: { dbAdapter: IDBAdapter; getPrivateEnv: () => PrivateEnv },
): Promise<SettingsCache> {
  const cache = getOrCreateCache(tenantId);
  const now = Date.now();

  // Invalidate cache after TTL
  if (cache.loaded && now - cache.loadedAt > CACHE_TTL) {
    cache.loaded = false;
    logger.debug(`Settings cache invalidated for tenant ${tenantId} (TTL expired)`);
  }

  // In production, return early if loaded. In tests (if overrides provided), always reload.
  if (cache.loaded && !overrides) {
    return cache;
  }

  try {
    const { dbAdapter, getPrivateEnv } = overrides || (await import("@src/databases/db"));

    // Check if database adapter is available (might not be during setup)
    if (!dbAdapter?.system.preferences) {
      logger.warn(
        `Database adapter not yet initialized, using empty settings cache for tenant ${tenantId}`,
      );
      // Return an empty cache but mark it as loaded to prevent repeated warnings
      cache.loaded = true;
      cache.loadedAt = Date.now();
      cache.public.PKG_VERSION = await loadPkgVersion();
      return cache;
    }

    // Load both public and private settings in parallel (scoped to tenant)
    const [publicResult, privateResult] = await Promise.all([
      dbAdapter.system.preferences.getMany(KNOWN_PUBLIC_KEYS, "system", tenantId as any),
      dbAdapter.system.preferences.getMany(KNOWN_PRIVATE_KEYS, "system", tenantId as any),
    ]);

    if (!publicResult.success) {
      throw new Error(
        `Failed to load public settings for tenant ${tenantId}: ${publicResult.error?.message || "Unknown error"}`,
      );
    }

    // Get public settings from database
    const publicSettings = publicResult.data || {};

    // Get private settings from database (may be empty)
    const privateDynamic = privateResult.success ? privateResult.data || {} : {};

    // Get private config settings (infrastructure settings)
    const inMemoryConfig = getPrivateEnv();

    let privateConfig: PrivateEnv;
    if (inMemoryConfig) {
      privateConfig = inMemoryConfig as any;
    } else {
      try {
        // Use a more dynamic approach for Vitest/Build resilience
        const isTest = process.env.NODE_ENV === "test" || process.env.TEST_MODE === "true";
        const configFilename = isTest ? "private.test" : "private";

        // Use dynamic import that won't be statically analyzed by Vite/Vitest easily
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

    // Safeguard: strip infrastructure keys from DB results
    for (const key of INFRASTRUCTURE_KEYS) {
      if (key in privateDynamic) {
        delete (privateDynamic as Record<string, unknown>)[key];
      }
    }

    // Load global fallback if this is a specific tenant
    let globalPublic = {};
    let globalPrivate = {};
    if (tenantId !== GLOBAL_TENANT) {
      // Use internal function to recurse without triggering infinite loop if misconfigured
      const globalCache = await loadSettingsCache(GLOBAL_TENANT, overrides);
      globalPublic = globalCache.public;
      globalPrivate = globalCache.private;
    }

    // Merge: global public + tenant dynamic public
    const mergedPublic = {
      ...globalPublic,
      ...publicSettings,
    };

    // Merge: global private + infrastructure settings from config + dynamic settings from DB
    // Use Object.assign for maximum compatibility in all JS environments
    const mergedPrivate = Object.assign({}, globalPrivate, privateConfig, privateDynamic);

    // Update cache with merged data
    cache.private = mergedPrivate as PrivateEnv;
    cache.public = mergedPublic as PublicEnv;
    cache.public.PKG_VERSION = await loadPkgVersion();
    cache.loaded = true;
    cache.loadedAt = Date.now();

    // 🚀 Dynamic Read-Replica Synchronization
    // If replicas are found in the merged private settings (loaded from DB),
    // we hot-load them into the database adapter.
    const replicas = (mergedPrivate as any).DB_REPLICA_URLS;
    if (replicas && dbAdapter.configureReplicas) {
      dbAdapter.configureReplicas(replicas);
    }

    return cache;
  } catch (error) {
    const { logger } = await import("@utils/logger");
    logger.error(`Failed to load settings cache for tenant ${tenantId}:`, error);
    cache.public.PKG_VERSION = await loadPkgVersion();
    throw error;
  }
}

/**
 * Invalidates the server-side cache, forcing a reload on the next request.
 */
export async function invalidateSettingsCache(tenantId?: string): Promise<void> {
  if (tenantId) {
    caches.delete(tenantId);
    logger.debug(`Settings cache manually invalidated for tenant ${tenantId}`);
  } else {
    caches.clear();
    logger.debug("All settings caches manually invalidated");
  }
}

/**
 * Populates the settings cache with new values.
 */
export async function setSettingsCache(
  newPrivate: PrivateEnv,
  newPublic: PublicEnv,
  tenantId: string = GLOBAL_TENANT,
): Promise<void> {
  const cache = getOrCreateCache(tenantId);
  cache.private = newPrivate;
  cache.public = { ...newPublic, PKG_VERSION: await loadPkgVersion() };
  cache.loaded = true;
  cache.loadedAt = Date.now();
}

/**
 * Check if cache is loaded
 */
export function isCacheLoaded(tenantId: string = GLOBAL_TENANT): boolean {
  return caches.get(tenantId)?.loaded ?? false;
}

/**
 * Type-safe setter for a private setting (SERVER ONLY)
 */
export async function setPrivateSetting<K extends keyof PrivateEnv>(
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

  // Invalidate cache
  invalidateSettingsCache(tenantId);
}

/**
 * Type-safe getter for a private setting (SERVER ONLY)
 */
export async function getPrivateSetting<K extends keyof PrivateEnv>(
  key: K,
  tenantId?: string,
): Promise<PrivateEnv[K]> {
  const { private: privateEnv } = await loadSettingsCache(tenantId);
  return privateEnv[key];
}

/**
 * Type-safe getter for a public setting (SERVER ONLY)
 */
export async function getPublicSetting<K extends keyof PublicEnv>(
  key: K,
  tenantId?: string,
): Promise<PublicEnv[K]> {
  const { public: publicEnv } = await loadSettingsCache(tenantId);
  return publicEnv[key];
}

/**
 * Gets a setting that is NOT defined in the schema (SERVER ONLY)
 */
export async function getUntypedSetting<T = unknown>(
  key: string,
  scope?: "public" | "private",
  tenantId?: string,
): Promise<T | undefined> {
  const { public: publicEnv, private: privateEnv } = await loadSettingsCache(tenantId);

  if ((!scope || scope === "public") && (publicEnv as Record<string, unknown>)[key] !== undefined) {
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

/**
 * SYNCHRONOUS cache accessors for legacy compatibility.
 */
export function getPublicSettingSync<K extends keyof PublicEnv>(
  key: K,
  tenantId: string = GLOBAL_TENANT,
): PublicEnv[K] {
  return getOrCreateCache(tenantId).public[key];
}

export function getPrivateSettingSync<K extends keyof PrivateEnv>(
  key: K,
  tenantId: string = GLOBAL_TENANT,
): PrivateEnv[K] {
  return getOrCreateCache(tenantId).private[key];
}

/**
 * Returns a merged view of all current settings for export.
 */
export async function getAllSettings(tenantId?: string): Promise<Record<string, unknown>> {
  const { public: publicEnv, private: privateEnv } = await loadSettingsCache(tenantId);
  return {
    public: { ...publicEnv },
    private: { ...privateEnv },
  } as Record<string, unknown>;
}

/**
 * Applies a snapshot to the database via systemPreferences adapter.
 */
export async function updateSettingsFromSnapshot(
  snapshot: Record<string, unknown>,
  tenantId: string = GLOBAL_TENANT,
): Promise<{ updated: number }> {
  const { dbAdapter } = await import("@src/databases/db");
  if (!dbAdapter?.system.preferences) {
    throw new Error("Database adapter not available");
  }

  type SnapshotRecord = Record<string, unknown>;
  type Snapshot = { settings?: SnapshotRecord } | SnapshotRecord;
  const snap = snapshot as Snapshot;
  const settings: SnapshotRecord =
    (snap as { settings?: SnapshotRecord }).settings ?? (snap as SnapshotRecord);

  const ops: Array<{
    key: string;
    value: unknown;
    scope: "user" | "system";
    userId?: any;
  }> = [];

  function isValueWrapper(v: unknown): v is { value: unknown } {
    return typeof v === "object" && v !== null && "value" in (v as Record<string, unknown>);
  }

  for (const [key, value] of Object.entries(settings)) {
    const v = isValueWrapper(value) ? value.value : value;
    ops.push({ key, value: v, scope: "system", userId: tenantId });
  }

  const res = await dbAdapter.system.preferences.setMany(ops);
  if (!res.success) {
    throw new Error(res.error?.message || "Failed to update settings");
  }

  // Invalidate cache so next access fetches fresh data
  invalidateSettingsCache(tenantId);

  return { updated: ops.length };
}
