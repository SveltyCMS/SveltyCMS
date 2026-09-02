/**
 * @file src/services/core/route-resource-state-machine.ts
 * @description
 * Microsecond Route Resource State Machine for SveltyCMS.
 *
 * Categorizes routes into precise operational resource specifications, defining required
 * cache categories, pre-warm endpoints, and memory bypass rules to optimize server hardware.
 *
 * ### Features:
 * - Exact-path Map + startsWith classify (1024-entry LRU) — not a radix trie
 * - Precise cache category pre-warming
 * - Memory footprint minimization (e.g. /login runs in < 2MB RAM)
 * - LocalCMS turbo fill (no internal HTTP) + confidence-gated next-path
 * - `parseCollectionRoute` splits paths only on the background prewarm path
 */

import { CacheCategory } from "@src/databases/cache/types";
import { logger } from "@utils/logger";
import { validateId } from "@src/databases/core/id-contract";
import {
  responseCache,
  buildUserResponseCacheKey,
  generateContentEtag,
} from "@src/services/cache/response-cache";

/** User identity for user-scoped turbo keys (never share bodies across users — FLAC). */
export interface PrewarmUser {
  _id?: unknown;
  id?: unknown;
  isAdmin?: boolean;
  role?: string;
}

export interface ParsedCollectionRoute {
  collectionId: string;
  entryId?: string;
}

const LOCALE_SEGMENT = /^[a-z]{2,5}(?:-[A-Za-z]+)?$/;
const APP_RESERVED = new Set([
  "api",
  "admin",
  "dashboard",
  "config",
  "login",
  "setup",
  "mediagallery",
  "media",
  "settings",
  "user",
  "plugin",
  "shop",
  "cart",
  "checkout",
  "account",
  "share",
  "health",
  "graphql",
  "auth",
  "system",
  "collections",
  "content",
]);

/**
 * Map an admin, locale-prefixed, or API path to `{ collectionId, entryId? }`.
 * Adapter-agnostic: no SQL, no dialect. Returns null for app chrome.
 */
export function parseCollectionRoute(path: string): ParsedCollectionRoute | null {
  if (!path) return null;
  const q = path.indexOf("?");
  const clean = q === -1 ? path : path.slice(0, q);
  const parts = clean.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  let i = 0;
  if (parts[i] && LOCALE_SEGMENT.test(parts[i]!) && parts[i] !== "api") i++;

  if (parts[i] === "api" && parts[i + 1] === "collections" && parts[i + 2]) {
    const collectionId = parts[i + 2]!;
    const entryId = parts[i + 3];
    return entryId && validateId(entryId) ? { collectionId, entryId } : { collectionId };
  }

  if (parts[i] === "collections" && parts[i + 1]) {
    const collectionId = parts[i + 1]!;
    const maybeId = parts[i + 2];
    return maybeId && validateId(maybeId) ? { collectionId, entryId: maybeId } : { collectionId };
  }

  if (parts[i] === "admin" && parts[i + 1] && !APP_RESERVED.has(parts[i + 1]!)) {
    const collectionId = parts[i + 1]!;
    const maybeId = parts[i + 2];
    return maybeId && validateId(maybeId) ? { collectionId, entryId: maybeId } : { collectionId };
  }

  const first = parts[i];
  if (!first || APP_RESERVED.has(first)) return null;
  const maybeId = parts[i + 1];
  return maybeId && validateId(maybeId)
    ? { collectionId: first, entryId: maybeId }
    : { collectionId: first };
}

function prewarmUserId(user?: PrewarmUser | null): string | null {
  if (!user) return null;
  const id = user._id ?? user.id;
  return id ? String(id) : null;
}

function stashTurboEnvelope(
  pathname: string,
  search: string,
  payload: unknown,
  tenantId: string,
  userId: string,
): void {
  const body = JSON.stringify(payload);
  const key = buildUserResponseCacheKey(pathname, search, userId);
  responseCache.set(
    key,
    { body, etag: generateContentEtag(body) },
    300_000,
    tenantId === "global" ? null : tenantId,
  );
}

export type RouteResourceLane =
  | "bootstrap"
  | "media"
  | "collection"
  | "dashboard"
  | "settings"
  | "api"
  | "graphql";

export interface RouteResourceSpec {
  lane: RouteResourceLane;
  requiredCacheCategories: CacheCategory[];
  preloadEndpoints: string[];
  skipMiddlewares: Array<"media" | "preferences" | "scim" | "collaboration">;
}

const ROUTE_SPECS: Record<RouteResourceLane, RouteResourceSpec> = {
  bootstrap: {
    lane: "bootstrap",
    requiredCacheCategories: [CacheCategory.SYSTEM],
    preloadEndpoints: ["/api/system/health"],
    skipMiddlewares: ["media", "preferences", "scim", "collaboration"],
  },
  media: {
    lane: "media",
    requiredCacheCategories: [CacheCategory.MEDIA, CacheCategory.SYSTEM],
    preloadEndpoints: ["/api/media", "/api/media/folders"],
    skipMiddlewares: ["scim", "collaboration"],
  },
  collection: {
    lane: "collection",
    requiredCacheCategories: [
      CacheCategory.SCHEMA,
      CacheCategory.AUTH,
      CacheCategory.SYSTEM,
      CacheCategory.CONTENT,
    ],
    preloadEndpoints: ["/api/collections", "/api/content"],
    skipMiddlewares: ["scim"],
  },
  dashboard: {
    lane: "dashboard",
    requiredCacheCategories: [CacheCategory.SYSTEM],
    preloadEndpoints: ["/api/dashboard", "/api/system/health"],
    skipMiddlewares: ["scim"],
  },
  settings: {
    lane: "settings",
    requiredCacheCategories: [CacheCategory.SYSTEM, CacheCategory.AUTH],
    preloadEndpoints: ["/api/settings", "/api/config"],
    skipMiddlewares: ["media", "collaboration"],
  },
  graphql: {
    lane: "graphql",
    requiredCacheCategories: [
      CacheCategory.SCHEMA,
      CacheCategory.AUTH,
      CacheCategory.SYSTEM,
      CacheCategory.CONTENT,
    ],
    preloadEndpoints: ["/api/graphql"],
    skipMiddlewares: ["media", "preferences", "scim", "collaboration"],
  },
  api: {
    lane: "api",
    requiredCacheCategories: [CacheCategory.SCHEMA, CacheCategory.AUTH, CacheCategory.SYSTEM],
    preloadEndpoints: ["/api/system/health"],
    skipMiddlewares: ["media", "preferences", "scim", "collaboration"],
  },
};

export class RouteResourceStateMachine {
  private _cache = new Map<string, RouteResourceSpec>([
    ["/login", ROUTE_SPECS.bootstrap],
    ["/setup", ROUTE_SPECS.bootstrap],
    ["/api/system/health", ROUTE_SPECS.api],
    ["/api/graphql", ROUTE_SPECS.graphql],
    ["/api/collections", ROUTE_SPECS.collection],
    ["/api/content", ROUTE_SPECS.collection],
    ["/api/media", ROUTE_SPECS.media],
    ["/api/settings", ROUTE_SPECS.settings],
    ["/api/config", ROUTE_SPECS.settings],
    ["/", ROUTE_SPECS.dashboard],
    ["/dashboard", ROUTE_SPECS.dashboard],
    ["/mediagallery", ROUTE_SPECS.media],
    ["/collections", ROUTE_SPECS.collection],
    ["/settings", ROUTE_SPECS.settings],
  ]);

  /**
   * Classifies URL into a precise RouteResourceSpec in < 10 microseconds.
   */
  public classifyRouteSpec(path: string): RouteResourceSpec {
    let spec = this._cache.get(path);
    if (spec !== undefined) return spec;

    const p = path.toLowerCase();

    if (p.startsWith("/api/graphql")) {
      spec = ROUTE_SPECS.graphql;
    } else if (p.startsWith("/api/collections") || p.startsWith("/api/content")) {
      spec = ROUTE_SPECS.collection;
    } else if (p.startsWith("/api/media")) {
      spec = ROUTE_SPECS.media;
    } else if (p.startsWith("/api/settings") || p.startsWith("/api/config")) {
      spec = ROUTE_SPECS.settings;
    } else if (p.startsWith("/api/")) {
      spec = ROUTE_SPECS.api;
    } else if (p === "/login" || p === "/setup" || p.startsWith("/auth")) {
      spec = ROUTE_SPECS.bootstrap;
    } else if (p.startsWith("/mediagallery") || p.startsWith("/media")) {
      spec = ROUTE_SPECS.media;
    } else if (p.startsWith("/collections") || p.startsWith("/content")) {
      spec = ROUTE_SPECS.collection;
    } else if (p.startsWith("/settings") || p.startsWith("/config")) {
      spec = ROUTE_SPECS.settings;
    } else {
      spec = ROUTE_SPECS.dashboard;
    }

    if (this._cache.size >= 1024) {
      const oldest = this._cache.keys().next().value;
      if (oldest !== undefined) this._cache.delete(oldest);
    }
    this._cache.set(path, spec);
    return spec;
  }

  private _inflightPrewarms = new Map<string, Promise<void>>();

  /**
   * Pre-warms the hovered/target path via LocalCMS (never internal HTTP).
   * Origin is kept for single-flight coalescing and API compat; it is not fetched.
   */
  public async prewarmRouteResources(
    path: string,
    origin?: string,
    tenantId: string = "global",
    user?: PrewarmUser | null,
  ): Promise<void> {
    const spec = this.classifyRouteSpec(path);
    const userId = prewarmUserId(user);
    const flightKey = `${origin || "local"}:${spec.lane}:${tenantId}:${userId || "anon"}`;
    const existing = this._inflightPrewarms.get(flightKey);
    if (existing) return existing;

    const promise = (async () => {
      try {
        await this.fillPredictedTurboCache(path, tenantId, user);
      } catch (err) {
        logger.debug("[RouteStateMachine] Pre-warm non-blocking warning:", err);
      } finally {
        this._inflightPrewarms.delete(flightKey);
      }
    })();

    this._inflightPrewarms.set(flightKey, promise);
    return promise;
  }

  /**
   * Load the collection/entry for `path` through LocalCMS and stash the
   * `{success,data}` envelope in `responseCache` under the Turbo GET key.
   * User-scoped only — no user means no turbo write (field-level auth).
   * Works on all four adapters; the adapter pick is `getDb()`.
   */
  public async fillPredictedTurboCache(
    path: string,
    tenantId: string = "global",
    user?: PrewarmUser | null,
  ): Promise<boolean> {
    const userId = prewarmUserId(user);
    if (!userId) return false;

    const parsed = parseCollectionRoute(path);
    if (!parsed) return false;

    try {
      const { getDb } = await import("@src/databases/db");
      const adapter = getDb();
      if (!adapter) return false;

      const { LocalCMS } = await import("@src/services/sdk");
      const cms = new LocalCMS(adapter);
      const opts = { tenantId, user };

      if (parsed.entryId) {
        const result = await cms.collections.findById(parsed.collectionId, parsed.entryId, opts);
        if (!result?.success || result.data == null) return false;
        const item = Array.isArray(result.data) ? result.data[0] : result.data;
        stashTurboEnvelope(
          `/api/collections/${parsed.collectionId}/${parsed.entryId}`,
          "",
          { success: true, data: item },
          tenantId,
          userId,
        );
        return true;
      }

      const list = await cms.collections.find(parsed.collectionId, {
        ...opts,
        limit: 20,
      });
      if (!list?.success) return false;
      stashTurboEnvelope(
        `/api/collections/${parsed.collectionId}`,
        "?limit=20",
        { success: true, data: list.data ?? [] },
        tenantId,
        userId,
      );
      return true;
    } catch (err) {
      logger.debug("[RouteStateMachine] LocalCMS turbo fill skipped:", err);
      return false;
    }
  }

  /**
   * Confidence-gated speculative pre-warm of the *next* path, plus the top
   * hot entries for this tenant (user-scoped turbo keys).
   */
  public async speculativePrewarm(
    currentPath: string,
    tenantId: string = "global",
    origin?: string,
    user?: PrewarmUser | null,
  ): Promise<string | null> {
    try {
      const { predictNextPathAdaptive, getHotEntries } =
        await import("@src/services/intelligence/behavioral-learner");
      const predicted = predictNextPathAdaptive(tenantId, currentPath);
      if (predicted && predicted !== currentPath) {
        if (origin) {
          this.prewarmRouteResources(predicted, origin, tenantId, user).catch(() => {});
        } else {
          this.fillPredictedTurboCache(predicted, tenantId, user).catch(() => {});
        }
      }

      const userId = prewarmUserId(user);
      if (userId) {
        const hot = getHotEntries(tenantId, 3);
        for (let i = 0; i < hot.length; i++) {
          const entry = hot[i]!;
          this.fillPredictedTurboCache(
            `/api/collections/${entry.collectionId}/${entry.entryId}`,
            tenantId,
            user,
          ).catch(() => {});
        }
      }

      return predicted && predicted !== currentPath ? predicted : null;
    } catch (err) {
      logger.debug("[RouteStateMachine] Speculative prewarm error:", err);
    }
    return null;
  }
}

export const routeResourceStateMachine = new RouteResourceStateMachine();
