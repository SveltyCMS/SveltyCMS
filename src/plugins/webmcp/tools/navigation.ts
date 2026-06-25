/**
 * @file src/plugins/webmcp/tools/navigation.ts
 * @description Headless topology discovery tools for WebMCP.
 *
 * Features:
 * - Admin topology discovery from collection schemas
 * - No client navigation dependencies (no goto, no $app/state)
 * - Works server-side with db adapter
 */

import type { IDBAdapter } from "@src/databases/db-interface";
import { logger } from "@utils/logger";

// ── Internal model context (browser-only fallback) ───────────────
function getModelContext() {
  if (typeof window === "undefined") return undefined;
  return (window.document as any)?.modelContext;
}

export function registerNavigationTools(db?: IDBAdapter): void {
  // Server-side: headless topology discovery
  if (db && typeof window === "undefined") {
    registerHeadlessTopologyTools(db);
    return;
  }

  // Client-side: browser modelContext
  const modelContext = getModelContext();
  if (!modelContext) return;

  // ── navigate_to (browser) ──────────────────────────────────────
  modelContext.registerTool({
    name: "navigate_to",
    description: "Navigate to a specific path inside the SveltyCMS admin dashboard.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Admin path starting with /" },
      },
      required: ["path"],
    },
    execute: async ({ path }: { path: string }) => {
      if (!path.startsWith("/")) {
        return {
          isError: true,
          content: [{ type: "text", text: "Path must start with /" }],
        };
      }
      try {
        const { goto } = await import("$app/navigation");
        await goto(path);
        return {
          content: [{ type: "text", text: `Successfully navigated to ${path}` }],
        };
      } catch (err: unknown) {
        logger.error("[WebMCP] navigate_to failed", { path, error: err });
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    },
  });

  // ── get_current_route (browser) ────────────────────────────────
  modelContext.registerTool({
    name: "get_current_route",
    description: "Returns current admin route and query parameters.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async () => {
      try {
        const { page } = await import("$app/state");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  pathname: page.url.pathname,
                  params: page.params,
                  query: Object.fromEntries(page.url.searchParams),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                pathname: "/",
                note: "Route unavailable (likely server-side)",
              }),
            },
          ],
        };
      }
    },
  });
}

// ── Headless topology discovery (server-side) ────────────────────
function registerHeadlessTopologyTools(db: IDBAdapter): void {
  logger.info("[WebMCP] Registering headless topology discovery tools...");

  async function discoverTopology() {
    try {
      const collections = await db.collection.listSchemas();
      const topology = {
        collections: collections.map((c: any) => ({
          id: c._id,
          name: c.name,
          slug: c.slug,
          apiPath: `/api/collections/${c.slug || c._id}`,
          adminPath: `/collections/${c.slug || c._id}`,
          fieldCount: c.fields?.length || 0,
          status: c.status || "published",
        })),
        adminRoutes: collections.map((c: any) => `/collections/${c.slug || c._id}`),
        apiRoutes: collections.map((c: any) => `/api/collections/${c.slug || c._id}`),
      };
      return topology;
    } catch (err: any) {
      logger.error("[WebMCP] Headless topology discovery failed", {
        error: err,
      });
      return { error: err.message };
    }
  }

  async function getContentGraph() {
    try {
      const collections = await db.collection.listSchemas();
      const graph: Record<string, { entries: number; relations: string[] }> = {};

      for (const col of collections) {
        try {
          const entriesResult = await db.crud.findMany(col._id, {}, { limit: 1 });
          if (entriesResult && typeof entriesResult === "object" && "data" in entriesResult) {
            const count = Array.isArray(entriesResult.data) ? entriesResult.data.length : 0;
            graph[col._id] = {
              entries: count,
              relations: (col.fields || [])
                .filter((f: any) => f.type === "relation" && f.relationTarget)
                .map((f: any) => f.relationTarget),
            };
          }
        } catch {
          graph[col._id] = { entries: 0, relations: [] };
        }
      }

      return graph;
    } catch (err: any) {
      logger.error("[WebMCP] Content graph discovery failed", { error: err });
      return { error: err.message };
    }
  }

  // Store topology tools for headless gateway integration
  (globalThis as any).__webmcp_headless_navigation = {
    discoverTopology,
    getContentGraph,
  };
}
