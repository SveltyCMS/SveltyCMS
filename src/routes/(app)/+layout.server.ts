/**
 * @file src/routes/(app)/+layout.server.ts
 * @description Enterprise-grade server-side logic for the main application layout.
 *
 * ### Features
 * - Content Loading
 * - User Management
 * - Theme Management
 * - Content Versioning
 *
 * ### Security
 * - Content Loading is cached
 * - User Management is cached
 * - Theme Management is cached
 * - Content Versioning is cached
 */

import { contentSystem } from "@src/content/index.server";
import { auth } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { DEFAULT_THEME } from "@src/databases/theme-manager";
import { publicEnv } from "@src/stores/global-settings.svelte";
import { logger } from "@utils/logger";
import { getPrivateSetting } from "@src/services/core/settings-service";
import { getCollectionOrder } from "@utils/collection-order.server";
import {
  predictNextPath,
  predictNextPathAdaptive,
  recordCollectionAccess,
  recordNavigation,
  reinforceTransition,
  applyExtinction,
} from "@src/services/intelligence/behavioral-learner";
import { cacheService } from "@src/databases/cache/cache-service";
import {
  LAYOUT_CACHE_TTL_S,
  getFreshLayoutUser,
  getLayoutPluginStates,
  layoutUserCountKey,
} from "@utils/server/layout-caches.server";
import { routeResourceStateMachine } from "@src/services/core/route-resource-state-machine";
import type { LayoutServerLoad } from "./$types";

interface LayoutError {
  code?: string;
  details?: string;
  message: string;
}

function createLayoutError(err: unknown, fallbackMessage: string): LayoutError {
  const isDevelopment = process.env.NODE_ENV === "development";

  return {
    message: fallbackMessage,
    details: isDevelopment && err instanceof Error ? err.message : undefined,
    code: "LAYOUT_LOAD_ERROR",
  };
}

export const load: LayoutServerLoad = async ({ locals, depends, url, request }) => {
  const { theme, user: sessionUser, cspNonce, tenantId } = locals;

  depends("app:content");
  depends("app:user-prefs");

  // Store is already initialized by root layout - just use it

  try {
    // 🧠 Behavioral Learning: record what's being accessed (< 0.001ms, non-blocking)
    const tid = tenantId || "global";
    const currentPath = url.pathname;

    // Extract collection ID from path: /en/posts/entry-id → posts
    const pathParts = currentPath.split("/").filter(Boolean);
    // pathParts: ["en", "posts", "entry-id"] or ["dashboard"] or ["config"]
    const collectionId = pathParts.length >= 2 ? pathParts[1] : pathParts[0] || "root";
    if (collectionId && !collectionId.startsWith("config") && collectionId !== "dashboard") {
      recordCollectionAccess(tid, collectionId);
    }

    // Record navigation transition for prefetch prediction
    const referer = request.headers.get("referer");
    if (referer) {
      try {
        const fromPath = new URL(referer).pathname;
        if (fromPath !== currentPath) {
          recordNavigation(tid, fromPath, currentPath);
          // 🧠 Skinnerian Reinforcement: reward correct predictions
          const wasPredicted = predictNextPath(tid, fromPath);
          if (wasPredicted === currentPath) {
            reinforceTransition(tid, fromPath, currentPath);
          }

          // 🧠 Extinction: weaken alternatives not chosen
          applyExtinction(tid, fromPath, currentPath);
        }
      } catch {
        /* invalid referer URL — skip */
      }
    }

    // Predictive prefetch: guess the most likely next page (< 0.05ms, non-blocking, confidence-gated)
    const predictedNextPath = predictNextPathAdaptive(tenantId || "global", url.pathname);
    if (predictedNextPath) {
      queueMicrotask(() => {
        void routeResourceStateMachine
          .fillPredictedTurboCache(predictedNextPath, tenantId || "global", sessionUser as any)
          .catch(() => {});
      });
    }

    await contentSystem.initialize(tenantId);

    // The content structure is owned by the root layout (`contentNodes`, the
    // sanitized flat client list from contentStore) — this layout must not
    // rebuild and ship the same node list again.

    // Parallelize critical layout queries with short-lived L1 cache
    const userCountKey = layoutUserCountKey(tenantId || "global");
    const aiSettingKey = `layout:aiEnabled`;

    const [freshUser, totalUsers, aiEnabled, pluginStates, collectionOrder] = await Promise.all([
      getFreshLayoutUser(sessionUser, tenantId),
      (async () => {
        const cached = cacheService.getSync<number>(userCountKey, tenantId);
        if (cached !== null) return cached;
        const key = tenantId ? String(tenantId) : "global";
        const authzCached = cacheService.getSync<{ count: number; timestamp: number }>(
          `userCount:${key}`,
          tenantId,
        );
        if (authzCached && typeof authzCached.count === "number") {
          void cacheService.set(userCountKey, authzCached.count, LAYOUT_CACHE_TTL_S, tenantId);
          return authzCached.count;
        }
        try {
          const count = (await auth?.getUserCount?.({}, { tenantId: tenantId as DatabaseId })) ?? 1;
          void cacheService.set(userCountKey, count, LAYOUT_CACHE_TTL_S, tenantId);
          return count;
        } catch {
          return 1;
        }
      })(),
      (async () => {
        const cached = cacheService.getSync<boolean>(aiSettingKey);
        if (cached !== null) return cached;
        try {
          const aiModelChat = await getPrivateSetting("AI_MODEL_CHAT");
          const enabled = !!(publicEnv.USE_AI_TAGGING || (aiModelChat && aiModelChat !== ""));
          void cacheService.set(aiSettingKey, enabled, LAYOUT_CACHE_TTL_S);
          return enabled;
        } catch {
          return !!publicEnv.USE_AI_TAGGING;
        }
      })(),
      getLayoutPluginStates(tid),
      getCollectionOrder(tenantId).catch((orderErr: unknown) => {
        logger.warn(
          `collectionOrder load failed (non-fatal): ${orderErr instanceof Error ? orderErr.message : String(orderErr)}`,
        );
        return [] as string[];
      }),
    ]);

    const safeTheme = theme ?? DEFAULT_THEME;

    // Ensure user payload has string _id
    const safeUser = freshUser
      ? {
          ...freshUser,
          _id: freshUser._id ? String(freshUser._id) : "",
        }
      : null;

    return {
      theme: safeTheme,
      tenantId,
      isAdmin: !!locals.isAdmin,

      user: safeUser,
      // Layout-owned copy of the same snapshot. Page loads may legitimately return
      // a slim `user` (e.g. `{_id, email, role, permissions}`) and SvelteKit merges
      // page data OVER layout data, which shadows the full record for every
      // component reading `page.data.user` (sidebar username, audit byline, …).
      // Shared chrome reads this key instead.
      layoutUser: safeUser,
      totalUsers,
      aiEnabled,
      publicSettings: publicEnv, // Use the reactive store
      collectionOrder,
      cspNonce,
      predictedNextPath,
      streamed: {}, // SvelteKit streaming marker
      pluginStates,
    };
  } catch (err: any) {
    // NEVER hard-500 the entire admin shell — media/dashboard/config pages all depend on this layout.
    logger.error("Failed to load layout data — returning minimal shell", {
      error: err?.message,
      stack: err?.stack,
      user: sessionUser?._id,
    });

    let fallbackUser: any = null;
    try {
      fallbackUser = sessionUser ? structuredClone(sessionUser) : null;
    } catch {
      if (sessionUser) {
        fallbackUser = {
          _id: String((sessionUser as any)._id ?? ""),
          email: (sessionUser as any).email,
          role: (sessionUser as any).role,
        };
      }
    }

    return {
      theme: DEFAULT_THEME,
      tenantId,
      isAdmin: !!locals.isAdmin,
      user: fallbackUser,
      layoutUser: fallbackUser,
      totalUsers: 1,
      aiEnabled: false,
      publicSettings: publicEnv,
      collectionOrder: [] as string[],
      cspNonce,
      predictedNextPath: null,
      streamed: {},
      pluginStates: {} as Record<string, boolean>,
      layoutError: createLayoutError(err, "Failed to load application data"),
    };
  }
};
