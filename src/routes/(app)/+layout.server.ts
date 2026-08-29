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

/**
 * Recursively strip values SvelteKit cannot serialize from load data.
 * Widget factories leak `validationSchema` (and other function-valued
 * properties) into the content structure; functions can never reach the
 * client over JSON anyway, so dropping them here is behavior-neutral.
 */
function stripNonSerializable(value: unknown): unknown {
  if (typeof value === "function") return undefined;
  if (Array.isArray(value)) {
    const cleaned = value.map(stripNonSerializable);
    return cleaned.filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const cleaned = stripNonSerializable(item);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  }
  return value;
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

    // Predictive prefetch: guess the most likely next page (< 0.05ms, non-blocking)
    const predictedNextPath = predictNextPath(tenantId || "global", url.pathname);

    // Start initialization but don't await generic content loading for the main thread
    // This prevents the "blank white page" issue
    const contentPromise = contentSystem.initialize(tenantId).then(() => {
      return Promise.all([
        contentSystem.getNavigationStructure(tenantId),
        contentSystem.collections.getSmartFirst(tenantId),
      ]);
    });

    // SvelteKit 3 requires serializable load returns — raw Promises in the
    // return serialize to HTTP 500 ("Failed to serialize promise") whenever
    // they are still pending under load (production build). Resolve here and
    // hand down plain data.
    const [, firstCollection] = await contentPromise;
    let safeContentStructure: unknown[] = [];
    try {
      // Persisted structure is the single source of truth for order/hierarchy.
      // The in-memory snapshot can lag a just-completed save (or be re-derived
      // by a background reconcile), and this value is pushed straight into the
      // sidebar/builder store on every `invalidate("app:content")` — serving
      // memory here rolled the UI back to the pre-save order right after saving.
      const persisted = await contentSystem.getContentStructureFromDatabase("flat", tenantId);
      const nodes =
        Array.isArray(persisted) && persisted.length > 0
          ? persisted
          : await contentSystem.getContentStructure(tenantId);
      const stringIdNodes = ((nodes ?? []) as Array<Record<string, unknown>>).map((node) => ({
        ...node,
        _id:
          (node._id as { toString?: () => string } | null | undefined)?.toString?.() ??
          String(node._id),
        ...(node.parentId ? { parentId: String(node.parentId) } : {}),
      }));
      // Deep-clean before returning: widget factories leak function values
      // (validationSchema) into the structure, and SvelteKit 3 rejects any
      // function in a load return (HTTP 500 "Cannot stringify a function").
      safeContentStructure = stripNonSerializable(stringIdNodes) as unknown[];
    } catch {
      /* non-fatal — sidebar renders empty */
    }

    // Parallelize critical layout queries with short-lived L1 cache
    const userCountKey = layoutUserCountKey(tenantId || "global");
    const aiSettingKey = `layout:aiEnabled`;

    const [freshUser, totalUsers, aiEnabled, pluginStates] = await Promise.all([
      getFreshLayoutUser(sessionUser, tenantId),
      (async () => {
        const cached = cacheService.getSync<number>(userCountKey, tenantId);
        if (cached !== null) return cached;
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
      contentStructure: safeContentStructure,

      user: safeUser,
      totalUsers,
      aiEnabled,
      publicSettings: publicEnv, // Use the reactive store
      collectionOrder: await getCollectionOrder(tenantId).catch((orderErr: unknown) => {
        logger.warn(
          `collectionOrder load failed (non-fatal): ${orderErr instanceof Error ? orderErr.message : String(orderErr)}`,
        );
        return [] as string[];
      }),
      cspNonce,
      predictedNextPath,
      streamed: {}, // SvelteKit streaming marker
      pluginStates,
      firstCollection,
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
      contentStructure: [],
      user: fallbackUser,
      totalUsers: 1,
      aiEnabled: false,
      publicSettings: publicEnv,
      collectionOrder: [] as string[],
      cspNonce,
      predictedNextPath: null,
      streamed: {},
      pluginStates: {} as Record<string, boolean>,
      firstCollection: null,
      layoutError: createLayoutError(err, "Failed to load application data"),
    };
  }
};
