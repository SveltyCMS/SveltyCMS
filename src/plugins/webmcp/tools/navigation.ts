/**
 * @file src/plugins/webmcp/tools/navigation.ts
 * @description Headless topology discovery tools for WebMCP.
 *
 * Features:
 * - Admin topology discovery from collection schemas
 * - No client navigation dependencies (no goto, no $app/state)
 * - Works server-side with db adapter
 */

import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
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

  async function discoverTopology(tenantId = "default") {
    try {
      const schemaResult = await db.collection.listSchemas();
      const collections =
        schemaResult &&
        typeof schemaResult === "object" &&
        "success" in schemaResult &&
        schemaResult.success
          ? ((schemaResult as { data?: unknown[] }).data ?? [])
          : Array.isArray(schemaResult)
            ? schemaResult
            : [];
      const native = (collections as any[]).map((c: any) => ({
        id: c._id,
        name: c.name,
        slug: c.slug,
        type: "native" as const,
        apiPath: `/api/collections/${c.slug || c._id}`,
        adminPath: `/collections/${c.slug || c._id}`,
        fieldCount: c.fields?.length || 0,
        status: c.status || "published",
      }));

      let virtual: any[] = [];
      try {
        const { extendTopology } = await import("@plugins/unified-data-hub/server/mcp-extension");
        const extended = await extendTopology(db, tenantId as unknown as DatabaseId);
        virtual = extended.collections ?? [];
      } catch {
        /* plugin not installed or disabled */
      }

      const all = [...native, ...virtual];
      return {
        collections: all,
        adminRoutes: all.map((c) => c.adminPath),
        apiRoutes: all.map((c) => c.apiPath),
      };
    } catch (err: any) {
      logger.error("[WebMCP] Headless topology discovery failed", {
        error: err,
      });
      return { error: err.message };
    }
  }

  async function getContentGraph(tenantId = "default") {
    try {
      const schemaResult = await db.collection.listSchemas();
      const collections =
        schemaResult &&
        typeof schemaResult === "object" &&
        "success" in schemaResult &&
        schemaResult.success
          ? ((schemaResult as { data?: unknown[] }).data ?? [])
          : Array.isArray(schemaResult)
            ? schemaResult
            : [];
      const graph: Record<
        string,
        {
          entries: number;
          relations: string[];
          type?: "native" | "virtual";
          connectorId?: string;
          enrichmentTargets?: string[];
        }
      > = {};

      for (const col of collections) {
        try {
          const entriesResult = await db.crud.findMany(col._id, {}, { limit: 1 });
          if (entriesResult && typeof entriesResult === "object" && "data" in entriesResult) {
            const count = Array.isArray(entriesResult.data) ? entriesResult.data.length : 0;
            const slug = col.slug ?? String(col._id);
            graph[slug] = {
              entries: count,
              type: "native",
              relations: (col.fields || [])
                .filter((f: any) => f.type === "relation" && f.relationTarget)
                .map((f: any) => f.relationTarget),
            };
          }
        } catch {
          const slug = col.slug ?? String(col._id);
          graph[slug] = { entries: 0, relations: [], type: "native" };
        }
      }

      try {
        const { extendContentGraph } =
          await import("@plugins/unified-data-hub/server/mcp-extension");
        return await extendContentGraph(db, tenantId as unknown as DatabaseId, graph);
      } catch {
        return graph;
      }
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
