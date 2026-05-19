/**
 * @file src/routes/api/[...path]/handlers/content.ts
 * @description Content event and version handlers for the dispatcher.
 */

import { json } from "@sveltejs/kit";
import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";

export async function handleContentRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url } = event;
  const namespace = segments[0];
  const method = segments[1];

  // --- Content Version & Refresh ---
  if (namespace === "content") {
    if (method === "version") {
      const { contentSystem } = await import("@src/content/index.server");
      return json({ version: contentSystem.getContentVersion() });
    }
    if (method === "refresh") {
      await cms.collections.refresh(tenantId);
      // Synchronous Schema Refresh
      const { _refreshSchema } = await import("../../graphql/+server");
      await _refreshSchema(cms.db, tenantId);
      return json({ success: true, message: "Content system and GraphQL schema refreshed" });
    }
    if (method === "collections") {
      // 🚀 SMART REFRESH: Use refreshCollectionsCache instead of cms.collections.refresh.
      // cms.collections.refresh triggers fullReload which calls contentStore.clear(null),
      // nuking ALL tenant buckets and rebuilding from filesystem only.
      // This destroys API-injected collections (benchmarks, dynamic schemas).
      // refreshCollectionsCache merges file + DB schemas without clearing.
      const { refreshCollectionsCache } = await import("@src/content/content-service.server");
      const { getDb } = await import("@src/databases/db");
      await refreshCollectionsCache(tenantId, getDb() || undefined);
      const list = await cms.collections.list({ tenantId, includeFields: true });
      return json({ success: true, data: list });
    }
  }

  // --- Content Structure ---
  if (namespace === "content-structure" || namespace === "content") {
    if (request.method === "GET" && namespace === "content-structure") {
      const action = url.searchParams.get("action") || "getStructure";
      if (action === "getStructure" || action === "getContentStructure") {
        const nodes = await cms.collections.getStructure(tenantId);
        return json({
          success: true,
          contentNodes: nodes,
          version: (cms as any).version || "0.0.8",
        });
      }
      throw new AppError(`Invalid GET action: ${action}`, 400);
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const { action, items } = body;

      // Support both POST /api/content/refresh (method=refresh) and POST /api/content-structure {action: "refresh"}
      if (
        method === "refresh" ||
        action === "refresh" ||
        action === "recompile" ||
        action === "refreshCollections"
      ) {
        await cms.collections.refresh(tenantId);
        return json({ success: true, message: "Content system refreshed" });
      }

      if (action === "reorderContentStructure") {
        if (!Array.isArray(items)) throw new AppError("Items must be an array", 422);
        const updated = await cms.collections.reorderContentNodes(items, tenantId);
        return json({ success: true, contentStructure: updated });
      }
    }
  }

  // --- Event & Content SSE Streams ---
  if (namespace === "events" || (namespace === "content" && method === "events")) {
    const { eventBus } = await import("@utils/event-bus");
    const stream = new ReadableStream({
      start(controller) {
        let isClosed = false;

        // Initial connection signal
        try {
          controller.enqueue(
            `event: connected\ndata: ${JSON.stringify({ status: "active", timestamp: Date.now() })}\n\n`,
          );
        } catch {
          isClosed = true;
          return;
        }

        const handler = (ev: any) => {
          if (!isClosed) {
            // Filter by tenantId if provided
            if (tenantId && ev.tenantId && ev.tenantId !== tenantId) return;

            try {
              controller.enqueue(`data: ${JSON.stringify(ev)}\n\n`);
            } catch {
              isClosed = true;
              eventBus.off("*", handler);
            }
          }
        };

        eventBus.on("*", handler);

        const interval = setInterval(() => {
          if (!isClosed) {
            try {
              controller.enqueue(`: keep-alive\n\n`);
            } catch {
              isClosed = true;
              clearInterval(interval);
              eventBus.off("*", handler);
            }
          }
        }, 30000);

        request.signal.addEventListener("abort", () => {
          if (!isClosed) {
            isClosed = true;
            eventBus.off("*", handler);
            clearInterval(interval);
            try {
              controller.close();
            } catch {}
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

  // --- Global Search ---
  if (namespace === "search" && request.method === "GET") {
    const q = url.searchParams.get("q") || "";

    const results = await cms.collections.search(q, {
      tenantId,
      collections: url.searchParams.get("type")?.split(",") || undefined,
      page: Number(url.searchParams.get("page")) || 1,
      limit: Number(url.searchParams.get("limit")) || 25,
      status: url.searchParams.get("status") || "published",
      isAdmin: !!event.locals.user,
    });

    const { rawResponse } = await import("./base");
    return rawResponse(event, results);
  }

  throw new AppError(`Content endpoint /api/${namespace}/${method || ""} not implemented`, 404);
}

/**
 * Proxy to the main GraphQL handler
 */
export async function handleGraphqlRoutes(event: RequestEvent) {
  const { POST } = await import("../../graphql/+server");
  return POST(event);
}
