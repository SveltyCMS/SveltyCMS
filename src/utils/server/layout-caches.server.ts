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
 * - invalidate on user-attribute writes and plugin toggle
 */

import type { User } from "@src/databases/auth/types";
import type { DatabaseId } from "@src/databases/db-interface";
import { cacheService } from "@src/databases/cache/cache-service";
import { pluginRegistry } from "@src/plugins/registry";

// Browser-reachable services (e.g. PluginSettingsService via src/plugins/index.ts)
// must not import this server-only module (SvelteKit guard) — they reach the
// invalidators through this globalThis bridge instead. Registered at module load.
const _g = globalThis as unknown as {
  __sveltycms_layout_invalidators?: { pluginStates?: (tenantId: string) => void };
};
_g.__sveltycms_layout_invalidators ??= {};
_g.__sveltycms_layout_invalidators.pluginStates = (tenantId: string): void => {
  void cacheService.delete(layoutPluginStatesKey(tenantId), tenantId).catch(() => {});
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

export function invalidateLayoutUserCache(userId: string, tenantId?: string | null): void {
  void cacheService.delete(layoutUserCacheKey(userId), tenantId ?? undefined).catch(() => {});
}

export function invalidateLayoutPluginStates(tenantId: string): void {
  void cacheService.delete(layoutPluginStatesKey(tenantId), tenantId).catch(() => {});
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

  try {
    const { withSystemScope } = await import("@src/databases/system-tenant-scope");
    const { auth } = await import("@src/databases/db");
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
  } catch {
    /* fall through to session snapshot */
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
  } catch {
    for (const plugin of plugins) {
      map[plugin.metadata.id] = plugin.metadata.enabled;
    }
  }

  void cacheService.set(layoutPluginStatesKey(tenantId), map, LAYOUT_CACHE_TTL_S, tenantId);
  return map;
}
