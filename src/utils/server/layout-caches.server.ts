/**
 * @file src/utils/server/layout-caches.server.ts
 * @description
 * Short-lived L1 caches for (app) layout data that is otherwise re-fetched on
 * every admin navigation: the session user snapshot, plugin enablement map,
 * and the user-count badge.
 *
 * ### Features:
 * - 15s L1 TTL (cacheService.set uses seconds)
 * - one findMany for all plugin slot states instead of N findOne
 * - single-flight: concurrent misses for the same user/tenant share one DB read
 * - invalidate on user-attribute writes and plugin toggle
 */

import type { User } from "@src/databases/auth/types";
import type { DatabaseId } from "@src/databases/db-interface";
import { cacheService } from "@src/databases/cache/cache-service";
import { pluginRegistry } from "@src/plugins/registry";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { logger } from "@utils/logger";

/** Cached lazy handle to the DB module — one module-registry lookup instead of one per call. */
let dbModulePromise: Promise<typeof import("@src/databases/db")> | undefined;
function loadDbModule(): Promise<typeof import("@src/databases/db")> {
  return (dbModulePromise ??= import("@src/databases/db"));
}

/**
 * In-flight single-flight guards (module scope). Concurrent misses for the same
 * user/tenant share one DB read; entries remove themselves once settled, and the
 * removal is identity-checked so an invalidation-triggered newer flight is never
 * clobbered by the settle of an older one.
 */
const inFlightUsers = new Map<string, Promise<User | null>>();
const inFlightPluginStates = new Map<string, Promise<Record<string, boolean>>>();

// Browser-reachable services (e.g. PluginSettingsService via src/plugins/index.ts)
// must not import this server-only module (SvelteKit guard) — they reach the
// invalidators through this globalThis bridge instead. Registered at module load.
const _g = globalThis as unknown as {
  __sveltycms_layout_invalidators?: { pluginStates?: (tenantId: string) => void };
};
_g.__sveltycms_layout_invalidators ??= {};
_g.__sveltycms_layout_invalidators.pluginStates = (tenantId: string): void => {
  inFlightPluginStates.delete(cacheService.generateKey(layoutPluginStatesKey(tenantId), tenantId));
  void cacheService.delete(layoutPluginStatesKey(tenantId), tenantId).catch((err) => {
    logger.debug(
      `[layout-caches] failed to delete plugin states cache for tenant "${tenantId}":`,
      err,
    );
  });
};

/** cacheService.set TTL is seconds, not milliseconds. */
export const LAYOUT_CACHE_TTL_S = 15;

export function layoutUserCacheKey(userId: string): string {
  return `layout:user:${userId}`;
}

export function layoutPluginStatesKey(tenantId: string): string {
  return `layout:pluginStates:${tenantId}`;
}

export function layoutUserCountKey(tenantId: string): string {
  return `layout:userCount:${tenantId}`;
}

/**
 * Drops the cached layout snapshot for one user.
 *
 * **Awaited by callers on purpose**: the previous `void cacheService.delete(…)` returned
 * before the delete landed, so a save→reload round-trip could be answered from the old
 * snapshot (observed 2026-09-27 while tracing E2E `profile.spec.ts:174`). Invalidation is
 * part of the write's contract — the module header says so — so it is awaited.
 */
export async function invalidateLayoutUserCache(
  userId: string,
  tenantId?: string | null,
): Promise<void> {
  const key = layoutUserCacheKey(userId);
  await cacheService.delete(key, tenantId ?? undefined).catch((err) => {
    logger.debug(`[layout-caches] failed to delete layout user cache for user "${userId}":`, err);
  });
  inFlightUsers.delete(cacheService.generateKey(key, tenantId));
}

/**
 * Session already carries the user. Re-read from DB at most once per TTL so
 * avatar/role edits show up, without a getUserById on every layout load.
 */
export async function getFreshLayoutUser(
  sessionUser: User | null,
  tenantId?: string | null,
): Promise<User | null> {
  if (!sessionUser) return null;

  const uid = String(sessionUser._id ?? "");
  if (!uid) return sessionUser;

  const cached = cacheService.getSync<User>(layoutUserCacheKey(uid), tenantId);
  if (cached) return cached;

  const flightKey = cacheService.generateKey(layoutUserCacheKey(uid), tenantId);
  const existing = inFlightUsers.get(flightKey);
  if (existing) return existing;

  let flight!: Promise<User | null>;
  flight = fetchFreshLayoutUser(sessionUser, uid, tenantId).finally(() => {
    if (inFlightUsers.get(flightKey) === flight) inFlightUsers.delete(flightKey);
  });
  inFlightUsers.set(flightKey, flight);
  return flight;
}

/** Shared DB read for one (user, tenant) flight — never rejects, falls back to the session snapshot. */
async function fetchFreshLayoutUser(
  sessionUser: User,
  uid: string,
  tenantId?: string | null,
): Promise<User | null> {
  try {
    const { auth } = await loadDbModule();
    // Branded system scope (cache-warming domain) — the session user snapshot
    // is re-read across the session's tenant context; the deprecated boolean
    // form is rejected by the tenant isolation gate (lint:tenant).
    const dbUser = await auth?.getUserById(sessionUser._id as DatabaseId, {
      ...withSystemScope("cache-warming", { tenantId: tenantId as DatabaseId }),
    });
    if (dbUser) {
      void cacheService.set(layoutUserCacheKey(uid), dbUser, LAYOUT_CACHE_TTL_S, tenantId);
      return dbUser;
    }

    if (sessionUser.email) {
      const byEmail = await auth?.getUserByEmail(
        { email: sessionUser.email, tenantId: tenantId as DatabaseId },
        { ...withSystemScope("cache-warming", { tenantId: tenantId as DatabaseId }) },
      );
      if (byEmail) {
        void cacheService.set(
          layoutUserCacheKey(String(byEmail._id ?? uid)),
          byEmail,
          LAYOUT_CACHE_TTL_S,
          tenantId,
        );
        return byEmail;
      }
    }
  } catch (err) {
    // Fall through to the session snapshot (unchanged control flow).
    logger.debug(
      `[layout-caches] fresh layout user read failed for user "${uid}", falling back to session snapshot:`,
      err,
    );
  }

  void cacheService.set(layoutUserCacheKey(uid), sessionUser, LAYOUT_CACHE_TTL_S, tenantId);
  return sessionUser;
}

/**
 * Enablement map for registered plugins (slots + optional dashboard widgets) — one findMany + 15s L1.
 */
export async function getLayoutPluginStates(tenantId: string): Promise<Record<string, boolean>> {
  const cached = cacheService.getSync<Record<string, boolean>>(
    layoutPluginStatesKey(tenantId),
    tenantId,
  );
  if (cached) return cached;

  const flightKey = cacheService.generateKey(layoutPluginStatesKey(tenantId), tenantId);
  const existing = inFlightPluginStates.get(flightKey);
  if (existing) return existing;

  let flight!: Promise<Record<string, boolean>>;
  flight = fetchLayoutPluginStates(tenantId).finally(() => {
    if (inFlightPluginStates.get(flightKey) === flight) inFlightPluginStates.delete(flightKey);
  });
  inFlightPluginStates.set(flightKey, flight);
  return flight;
}

/** Shared plugin-state read for one tenant — never rejects, falls back to metadata defaults. */
async function fetchLayoutPluginStates(tenantId: string): Promise<Record<string, boolean>> {
  const map: Record<string, boolean> = {};
  const plugins = pluginRegistry.getAll();
  if (plugins.length === 0) return map;

  try {
    const all = await pluginRegistry.getAllPluginStates(tenantId);
    const byId = new Map(all.map((s) => [s.pluginId, s]));
    for (const plugin of plugins) {
      const state = byId.get(plugin.metadata.id);
      map[plugin.metadata.id] = state?.enabled ?? plugin.metadata.enabled;
    }
  } catch (err) {
    logger.debug(
      `[layout-caches] plugin states read failed for tenant "${tenantId}", falling back to plugin metadata defaults:`,
      err,
    );
    for (const plugin of plugins) {
      map[plugin.metadata.id] = plugin.metadata.enabled;
    }
  }

  void cacheService.set(layoutPluginStatesKey(tenantId), map, LAYOUT_CACHE_TTL_S, tenantId);
  return map;
}
