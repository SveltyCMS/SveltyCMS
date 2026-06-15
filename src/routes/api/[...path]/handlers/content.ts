/**
 * @file src/routes/api/[...path]/handlers/content.ts
 * @description Content system, versioning, refresh, real-time events (SSE), search, and GraphQL proxy.
 *
 * Responsibilities:
 * - Content version reporting
 * - Full and smart collection refresh (preserving API-injected schemas)
 * - Content structure retrieval and reordering
 * - Server-Sent Events for real-time content updates
 * - Global cross-collection search
 * - GraphQL endpoint proxy
 */

import { json } from "@sveltejs/kit";
import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse, rawResponse } from "./base";

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

export async function handleContentRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url } = event;
  const namespace = segments[0];
  const method = segments[1];

  try {
    // ── Content System Management ──
    if (namespace === "content") {
      switch (method) {
        case "version":
          return handleContentVersion(event);

        case "refresh":
          return handleContentRefresh(event, cms, tenantId);

        case "collections":
          return handleCollectionsRefresh(event, cms, tenantId);

        case "events":
          return handleContentEventsStream(event, tenantId);
      }

      // POST /api/content/refresh (alternative to /api/content-structure)
      if (request.method === "POST" && (method === "refresh" || method === "recompile")) {
        await cms.collections.refresh(tenantId);
        return successResponse(event, {
          success: true,
          message: "Content system refreshed",
        });
      }
    }

    // ── Content Structure ──
    if (namespace === "content-structure") {
      switch (request.method) {
        case "GET":
          return handleGetContentStructure(event, cms, tenantId, url);
        case "POST":
          return handleContentStructureAction(event, cms, tenantId);
      }
      throw new AppError("Method not allowed", 405);
    }

    // ── Real-time Events (SSE) ──
    if (namespace === "events") {
      return handleContentEventsStream(event, tenantId);
    }

    // ── Global Search ──
    if (namespace === "search" && request.method === "GET") {
      return handleGlobalSearch(event, cms, tenantId, url);
    }

    // ── GraphQL Proxy ──
    if (namespace === "graphql") {
      return handleGraphqlRoutes(event);
    }

    throw new AppError(`Content endpoint /api/${segments.join("/")} not implemented`, 404);
  } catch (err: any) {
    console.error(`[ContentRoute Error] ${segments.join("/")}:`, err);
    if (err instanceof AppError) throw err;
    throw new AppError(err.message || "Content operation failed", 500);
  }
}

// ─── Content System Handlers ─────────────────────────────────────────────────

/** Returns the current content system version. */
async function handleContentVersion(event: RequestEvent) {
  const { contentSystem } = await import("@src/content/index.server");
  return successResponse(event, { version: contentSystem.getContentVersion() });
}

/** Full refresh: rescans filesystem, rebuilds collections, regenerates GraphQL schema. */
async function handleContentRefresh(event: RequestEvent, cms: LocalCMS, tenantId: DatabaseId) {
  await cms.collections.refresh(tenantId);

  // Synchronously refresh GraphQL schema after collections rebuild
  const { _refreshSchema } = await import("../../graphql/+server");
  await _refreshSchema(cms.db, tenantId);

  return successResponse(event, {
    success: true,
    message: "Content system and GraphQL schema refreshed successfully",
  });
}

/**
 * Smart collections refresh that preserves API-injected collections.
 * Uses refreshCollectionsCache instead of cms.collections.refresh to avoid
 * clearing all tenant buckets (which would destroy dynamic/benchmark schemas).
 */
async function handleCollectionsRefresh(event: RequestEvent, cms: LocalCMS, tenantId: DatabaseId) {
  const { refreshCollectionsCache } = await import("@src/content/content-service.server");
  const { getDb } = await import("@src/databases/db");

  await refreshCollectionsCache(tenantId, getDb() || undefined);

  const list = await cms.collections.list({ tenantId, includeFields: true });
  return successResponse(event, {
    success: true,
    message: "Collections cache refreshed",
    data: list,
  });
}

// ─── Content Structure Handlers ──────────────────────────────────────────────

/** Retrieves the full content tree structure. */
async function handleGetContentStructure(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  url: URL,
) {
  const action = url.searchParams.get("action") || "getStructure";

  if (action !== "getStructure" && action !== "getContentStructure") {
    throw new AppError(`Invalid GET action: ${action}`, 400);
  }

  const nodes = await cms.collections.getStructure(tenantId);
  return successResponse(event, {
    contentNodes: nodes,
    version: (cms as any).version || "0.0.8",
  });
}

/** Handles POST actions on content structure (refresh, reorder). */
async function handleContentStructureAction(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
) {
  const body = await event.request.json().catch(() => ({}));
  const { action, items } = body;

  switch (action) {
    case "refresh":
    case "recompile":
    case "refreshCollections":
      await cms.collections.refresh(tenantId);
      return successResponse(event, {
        success: true,
        message: "Content structure refreshed",
      });

    case "reorderContentStructure": {
      if (!Array.isArray(items)) throw new AppError("Items must be an array", 422);
      const updated = await cms.collections.reorderContentNodes(items, tenantId);
      return successResponse(event, { contentStructure: updated });
    }

    default:
      throw new AppError(`Unknown content structure action: ${action}`, 400);
  }
}

// ─── Real-time Events (Server-Sent Events) ───────────────────────────────────

/** Maps internal EventBus names to client-friendly SSE `type` values. */
const SSE_EVENT_TYPE_MAP: Record<string, string> = {
  "content:update": "content_update",
  "cache:invalidate": "cache_invalidate",
  "config:change": "config_change",
};

/**
 * Normalizes wildcard EventBus payloads into a stable SSE wire format.
 * Returns null when the event should be filtered out for the subscriber tenant.
 */
export function normalizeSseEventPayload(
  payload: { event?: string; data?: Record<string, unknown> } | null | undefined,
  filterTenantId?: string | null,
): Record<string, unknown> | null {
  const eventName = payload?.event;
  if (!eventName) return null;

  const data = payload?.data ?? {};
  const eventTenantId = data.tenantId as string | undefined;

  if (
    filterTenantId &&
    eventTenantId &&
    eventTenantId !== "all" &&
    String(eventTenantId) !== String(filterTenantId)
  ) {
    return null;
  }

  return {
    type: SSE_EVENT_TYPE_MAP[eventName] ?? eventName.replace(/:/g, "_"),
    event: eventName,
    ...data,
    timestamp: Date.now(),
  };
}

/**
 * Establishes a Server-Sent Events stream for real-time content updates.
 * Filters events by tenantId when provided.
 * Sends keep-alive pings every 30 seconds.
 * Cleans up on client disconnect via AbortSignal.
 */
async function handleContentEventsStream(event: RequestEvent, tenantId: DatabaseId) {
  const { eventBus } = await import("@utils/event-bus");
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;

      // Initial connection confirmation
      try {
        controller.enqueue(
          encoder.encode(
            `event: connected\ndata: ${JSON.stringify({ status: "active", timestamp: Date.now() })}\n\n`,
          ),
        );
        // adapter-uws flushes streaming responses after it has seen a second chunk,
        // so emit an immediate comment frame to keep SSE responsive in production.
        controller.enqueue(encoder.encode(": connected\n\n"));
      } catch {
        isClosed = true;
        return;
      }

      // Event handler — normalized wire format + tenant filtering
      const handler = (payload: { event?: string; data?: Record<string, unknown> }) => {
        if (isClosed) return;
        const clientPayload = normalizeSseEventPayload(payload, tenantId);
        if (!clientPayload) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(clientPayload)}\n\n`));
        } catch {
          isClosed = true;
          eventBus.off("*", handler);
        }
      };

      eventBus.on("*", handler);

      // Keep-alive ping every 30s
      const keepAlive = setInterval(() => {
        if (!isClosed) {
          try {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          } catch {
            isClosed = true;
            clearInterval(keepAlive);
            eventBus.off("*", handler);
          }
        }
      }, 30000);

      // Cleanup on client disconnect
      event.request.signal.addEventListener("abort", () => {
        isClosed = true;
        clearInterval(keepAlive);
        eventBus.off("*", handler);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ─── Global Search ──────────────────────────────────────────────────────────

/** Cross-collection search with type filtering and pagination. */
async function handleGlobalSearch(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  url: URL,
) {
  const q = url.searchParams.get("q") || "";

  const results = await cms.collections.search(q, {
    tenantId,
    collections: url.searchParams.get("type")?.split(",") || undefined,
    page: Number(url.searchParams.get("page")) || 1,
    limit: Number(url.searchParams.get("limit")) || 25,
    status: url.searchParams.get("status") || "published",
    isAdmin: !!event.locals.user,
  });

  return rawResponse(event, results);
}

// ─── GraphQL Proxy ───────────────────────────────────────────────────────────

/** Proxies to the main GraphQL handler at /api/graphql. */
export async function handleGraphqlRoutes(event: RequestEvent) {
  const { POST } = await import("../../graphql/+server");
  return POST(event);
}
