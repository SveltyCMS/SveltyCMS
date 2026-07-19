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
import type { User } from "@src/databases/auth/types";
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
import { pluginRegistry } from "@src/plugins/registry";
import type { LayoutServerLoad } from "./$types";

interface LayoutError {
  code?: string;
  details?: string;
  message: string;
}

async function refreshUser(
  sessionUser: User | null,
  tenantId?: string | null,
): Promise<User | null> {
  if (!sessionUser) {
    return null;
  }

  try {
    const dbUser = await auth?.getUserById(sessionUser._id as DatabaseId, {
      tenantId: tenantId as DatabaseId,
      bypassTenantCheck: true,
    });

    if (dbUser) {
      logger.debug("Fresh user data loaded in layout", {
        userId: dbUser._id,
        hasAvatar: !!dbUser.avatar,
        avatar: dbUser.avatar,
      });
      return dbUser;
    }

    logger.warn("User not found in database, using session data", {
      userId: sessionUser._id,
    });
    return sessionUser;
  } catch (err: any) {
    logger.warn("Failed to fetch fresh user data in layout, using session data", {
      error: err.message,
      userId: sessionUser._id,
    });
    return sessionUser;
  }
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

    // User data is critical for shell, but we try to use session data if fast
    // refreshUser is reasonably fast, so we can await it or stream it too
    const freshUser = await refreshUser(sessionUser, tenantId);

    // Get total user count for smart UI logic (like hiding chat for single users)
    let totalUsers = 1;
    try {
      totalUsers = (await auth?.getUserCount?.({}, { tenantId: tenantId as DatabaseId })) ?? 1;
    } catch {
      totalUsers = 1;
    }

    // Check if AI features are enabled for solo user assistant
    let aiEnabled = !!publicEnv.USE_AI_TAGGING;
    try {
      const aiModelChat = await getPrivateSetting("AI_MODEL_CHAT");
      aiEnabled = !!(publicEnv.USE_AI_TAGGING || (aiModelChat && aiModelChat !== ""));
    } catch {
      /* settings optional */
    }

    // Plugin enablement states for client-side feature gating
    // (non-blocking — resolves instantly from in-memory registry, fallback to metadata.enabled)
    const pluginStates: Record<string, boolean> = {};
    try {
      for (const plugin of pluginRegistry.getAll()) {
        // Only load state for plugins with UI slots (avoids loading all plugins)
        if (!plugin.ui?.slots?.length) continue;
        const state = await pluginRegistry.getPluginState(plugin.metadata.id, tid);
        pluginStates[plugin.metadata.id] = state?.enabled ?? plugin.metadata.enabled;
      }
    } catch {
      // Plugin state check is non-critical
    }

    let safeTheme = DEFAULT_THEME;
    try {
      safeTheme = theme ? JSON.parse(JSON.stringify(theme)) : DEFAULT_THEME;
    } catch {
      safeTheme = DEFAULT_THEME;
    }

    // Ensure user payload is JSON-serializable (ObjectId/Buffer previously 500'd shells)
    let safeUser: any = null;
    try {
      safeUser = freshUser ? JSON.parse(JSON.stringify(freshUser)) : null;
    } catch {
      if (freshUser) {
        safeUser = {
          _id: String((freshUser as any)._id ?? ""),
          email: (freshUser as any).email,
          role: (freshUser as any).role,
          username: (freshUser as any).username,
          avatar:
            typeof (freshUser as any).avatar === "string" ? (freshUser as any).avatar : undefined,
        };
      }
    }

    return {
      theme: safeTheme,
      tenantId,
      isAdmin: !!locals.isAdmin,
      // Streamed data (Promises) — always resolve; never reject into error boundary
      contentStructure: contentPromise
        .then(async () => {
          try {
            const nodes = await contentSystem.getContentStructure(tenantId);
            return (nodes ?? []).map((node: any) => {
              const sanitized = JSON.parse(JSON.stringify(node));
              return {
                ...sanitized,
                _id: node._id?.toString?.() ?? String(node._id),
                ...(node.parentId ? { parentId: node.parentId.toString() } : {}),
              };
            });
          } catch {
            return [];
          }
        })
        .catch(() => []),

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
      firstCollection: contentPromise
        .then(([_, first]) => {
          try {
            return first ? JSON.parse(JSON.stringify(first)) : null;
          } catch {
            return null;
          }
        })
        .catch(() => null),
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
      fallbackUser = sessionUser ? JSON.parse(JSON.stringify(sessionUser)) : null;
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
      contentStructure: Promise.resolve([]),
      user: fallbackUser,
      totalUsers: 1,
      aiEnabled: false,
      publicSettings: publicEnv,
      collectionOrder: [] as string[],
      cspNonce,
      predictedNextPath: null,
      streamed: {},
      pluginStates: {} as Record<string, boolean>,
      firstCollection: Promise.resolve(null),
      layoutError: createLayoutError(err, "Failed to load application data"),
    };
  }
};
