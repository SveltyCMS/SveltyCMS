/**
 * @file src/plugins/webmcp/tools/virtual-collections.ts
 * @description WebMCP tools for Unified Data Hub virtual collections (read-only v1.0).
 *
 * CMS-agnostic: tool handlers delegate to unified-data-hub mcp-extension regardless
 * of CMS DB_TYPE (sqlite | mongodb | mariadb | postgresql).
 *
 * Features:
 * - list_virtual_collections — schemas + sanitized connector health
 * - query_virtual_collection — governed paginated reads with cursor/include (no writes)
 * - enrich_virtual_collection — batch native-key stitch reads (no writes)
 * - Headless globalThis bridge for remote MCP gateways
 */

import type { DatabaseId, IDBAdapter } from "@databases/db-interface";
import { logger } from "@utils/logger";

function getModelContext() {
  if (typeof window === "undefined") return undefined;
  return (window.document as any)?.modelContext;
}

async function hubExtension(_db: IDBAdapter) {
  const {
    enrichVirtualCollectionForAgent,
    listVirtualCollectionsForAgent,
    queryVirtualCollectionForAgent,
    isHubEnabled,
  } = await import("@plugins/unified-data-hub/server/mcp-extension");
  return {
    enrichVirtualCollectionForAgent,
    listVirtualCollectionsForAgent,
    queryVirtualCollectionForAgent,
    isHubEnabled,
  };
}

export function registerVirtualCollectionTools(db?: IDBAdapter): void {
  // When db is provided, always register headless tools (server / test harness).
  if (db) {
    registerHeadlessVirtualTools(db);
    return;
  }

  const modelContext = getModelContext();
  if (!modelContext) return;

  modelContext.registerTool({
    name: "list_virtual_collections",
    description:
      "List federated virtual collections and connector health (Unified Data Hub). Read-only.",
    parameters: {
      type: "object",
      properties: {
        tenantId: { type: "string", description: "Tenant scope (default: default)" },
      },
      required: [],
    },
    execute: async (params: { tenantId?: string }) => {
      try {
        const qs = params.tenantId ? `?tenantId=${encodeURIComponent(params.tenantId)}` : "";
        const res = await fetch(`/api/virtual-collections${qs}`, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: unknown) {
        return formatError("[WebMCP] list_virtual_collections failed", err);
      }
    },
  });

  modelContext.registerTool({
    name: "query_virtual_collection",
    description:
      "Query a virtual (federated) collection with pagination and optional include. Read-only — no create/update/delete.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Virtual collection slug or id" },
        limit: { type: "number", description: "Max 100" },
        offset: { type: "number" },
        cursor: { type: "string", description: "Per-source cursor token" },
        include: {
          type: "array",
          items: { type: "string" },
          description: "Same-source relation names to expand",
        },
        bypassCache: { type: "boolean" },
      },
      required: ["slug"],
    },
    execute: async (params: {
      slug: string;
      limit?: number;
      offset?: number;
      cursor?: string;
      include?: string[];
      bypassCache?: boolean;
    }) => {
      try {
        const safeLim = Math.min(Math.max(1, params.limit ?? 25), 100);
        const qs = new URLSearchParams({
          limit: String(safeLim),
          offset: String(Math.max(0, params.offset ?? 0)),
        });
        if (params.cursor) qs.set("cursor", params.cursor);
        if (params.include?.length) qs.set("include", params.include.join(","));
        if (params.bypassCache) qs.set("bypassCache", "true");
        const res = await fetch(`/api/virtual-collections/${params.slug}?${qs}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: unknown) {
        return formatError("[WebMCP] query_virtual_collection failed", err);
      }
    },
  });

  modelContext.registerTool({
    name: "enrich_virtual_collection",
    description:
      "Batch-fetch virtual rows by foreign keys (native stitch enrich). Read-only — no create/update/delete.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Virtual collection slug or id" },
        keys: {
          type: "array",
          items: { type: "string" },
          description: "Native entry keys to match against virtualKeyField",
        },
        field: { type: "string", description: "Virtual field to match (default: id)" },
        bypassCache: { type: "boolean" },
      },
      required: ["slug", "keys"],
    },
    execute: async (params: {
      slug: string;
      keys: string[];
      field?: string;
      bypassCache?: boolean;
    }) => {
      try {
        const qs = new URLSearchParams({
          keys: (params.keys ?? []).join(","),
          field: params.field ?? "id",
        });
        if (params.bypassCache) qs.set("bypassCache", "true");
        const res = await fetch(
          `/api/virtual-collections/${encodeURIComponent(params.slug)}/enrich?${qs}`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: unknown) {
        return formatError("[WebMCP] enrich_virtual_collection failed", err);
      }
    },
  });
}

function registerHeadlessVirtualTools(db: IDBAdapter): void {
  logger.info("[WebMCP] Registering headless virtual collection tools...");

  async function list_virtual_collections(
    tenantId: DatabaseId = "default" as unknown as DatabaseId,
    user?: { _id?: string; role?: string; isAdmin?: boolean },
  ) {
    try {
      const { listVirtualCollectionsForAgent, isHubEnabled } = await hubExtension(db);
      if (!(await isHubEnabled(db, tenantId))) {
        return { collections: [], connectors: [], enabled: false };
      }
      const data = await listVirtualCollectionsForAgent(db, tenantId, user);
      return { ...data, enabled: true };
    } catch (err: any) {
      logger.error("[WebMCP] list_virtual_collections failed", { error: err });
      return { error: err.message };
    }
  }

  async function query_virtual_collection(
    slug: string,
    tenantId: DatabaseId = "default" as unknown as DatabaseId,
    options: {
      limit?: number;
      offset?: number;
      cursor?: string;
      include?: string[];
      bypassCache?: boolean;
      user?: { _id?: string; role?: string; isAdmin?: boolean };
    } = {},
    roles: unknown[] = [],
  ) {
    try {
      const { queryVirtualCollectionForAgent, isHubEnabled } = await hubExtension(db);
      if (!(await isHubEnabled(db, tenantId))) {
        return { error: "Unified Data Hub plugin is not enabled", code: "HUB_DISABLED" };
      }
      return await queryVirtualCollectionForAgent(db, slug, tenantId, options, roles);
    } catch (err: any) {
      if (err?.code) {
        return { error: err.message, code: err.code };
      }
      logger.error("[WebMCP] query_virtual_collection failed", { slug, error: err });
      return { error: err.message };
    }
  }

  async function enrich_virtual_collection(
    slug: string,
    keys: (string | number)[],
    tenantId: DatabaseId = "default" as unknown as DatabaseId,
    options: {
      virtualKeyField?: string;
      bypassCache?: boolean;
      user?: { _id?: string; role?: string; isAdmin?: boolean };
    } = {},
    roles: unknown[] = [],
  ) {
    try {
      const { enrichVirtualCollectionForAgent, isHubEnabled } = await hubExtension(db);
      if (!(await isHubEnabled(db, tenantId))) {
        return { error: "Unified Data Hub plugin is not enabled", code: "HUB_DISABLED" };
      }
      return await enrichVirtualCollectionForAgent(db, slug, keys, tenantId, options, roles);
    } catch (err: any) {
      if (err?.code) {
        return { error: err.message, code: err.code };
      }
      logger.error("[WebMCP] enrich_virtual_collection failed", { slug, error: err });
      return { error: err.message };
    }
  }

  const existing = (globalThis as any).__webmcp_headless_tools ?? {};
  (globalThis as any).__webmcp_headless_tools = {
    ...existing,
    list_virtual_collections,
    query_virtual_collection,
    enrich_virtual_collection,
  };
}

function formatError(tag: string, err: unknown) {
  logger.error(tag, { error: err });
  return {
    isError: true,
    content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
  };
}
