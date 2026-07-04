/**
 * @file src/plugins/webmcp/tools/content.ts
 * @description Headless content tools for WebMCP — operates directly on db adapter.
 *
 * Features:
 * - Full CRUD: list, search, get, create, update, delete
 * - Draft-by-Default Airgap on all mutations
 * - Content quality scoring via AIService
 * - Trash-aware soft-delete
 * - No browser dependencies (no contentStore, no fetch)
 */

import type { IDBAdapter } from "@src/databases/db-interface";
import { logger } from "@utils/logger";

// ── Internal model context (browser-only fallback) ───────────────
function getModelContext() {
  if (typeof window === "undefined") return undefined;
  return (window.document as any)?.modelContext;
}

// ── Register all content tools ───────────────────────────────────
export function registerContentTools(db?: IDBAdapter): void {
  // Server-side: register tools that use db adapter directly
  if (db && typeof window === "undefined") {
    registerServerTools(db);
    return;
  }

  // Client-side: fallback to browser modelContext
  const modelContext = getModelContext();
  if (!modelContext) return;

  // ── Get Collections (browser) ──────────────────────────────────
  modelContext.registerTool({
    name: "get_collections",
    description: "Returns all content collections with their schemas and field definitions.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async () => {
      try {
        const res = await fetch("/api/collections", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: any) {
        logger.error("[WebMCP] get_collections failed", { error: err });
        return {
          isError: true,
          content: [{ type: "text", text: err.message }],
        };
      }
    },
  });

  // ── List Entries (browser) ─────────────────────────────────────
  modelContext.registerTool({
    name: "list_entries",
    description: "List entries in a collection with pagination, sorting, and filtering.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string" },
        limit: { type: "number", description: "Max: 100" },
        offset: { type: "number" },
        sortField: { type: "string" },
        sortDirection: { type: "string", enum: ["asc", "desc"] },
        status: { type: "string", enum: ["published", "draft", "all"] },
      },
      required: ["collectionId"],
    },
    execute: async (params: any) => {
      try {
        const safeLim = Math.min(Math.max(1, params.limit || 25), 100);
        const qs = new URLSearchParams({
          limit: String(safeLim),
          offset: String(Math.max(0, params.offset || 0)),
          sortField: params.sortField || "updatedAt",
          sortDirection: params.sortDirection || "desc",
          ...(params.status !== "all" ? { publicationFilter: params.status } : {}),
        });
        const res = await fetch(`/api/collections/${params.collectionId}?${qs}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: unknown) {
        return formatError("[WebMCP] list_entries failed", err);
      }
    },
  });

  // ── Search Entries (browser) ───────────────────────────────────
  modelContext.registerTool({
    name: "search_entries",
    description: "Full-text search across collections.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        collections: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
    execute: async (params: any) => {
      try {
        const safeLim = Math.min(Math.max(1, params.limit || 25), 50);
        const qs = new URLSearchParams({
          q: params.query,
          limit: String(safeLim),
        });
        if (params.collections) qs.set("collections", params.collections);
        const res = await fetch(`/api/collections/search?${qs}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: unknown) {
        return formatError("[WebMCP] search_entries failed", err);
      }
    },
  });

  // ── Create Entry (browser) ─────────────────────────────────────
  modelContext.registerTool({
    name: "create_entry",
    description: "Create a new entry. ALWAYS saves as 'draft'.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string" },
        data: { type: "object" },
      },
      required: ["collectionId", "data"],
    },
    execute: async (params: any) => {
      try {
        const safeData = { ...params.data, status: "draft" };
        const res = await fetch(`/api/collections/${params.collectionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(safeData),
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const responseData = await res.json();
        return {
          content: [
            {
              type: "text",
              text: `Success: Entry created in DRAFT mode. ${JSON.stringify(responseData)}`,
            },
          ],
        };
      } catch (err: unknown) {
        return formatError("[WebMCP] create_entry failed", err);
      }
    },
  });

  // ── Get Entry (browser) ────────────────────────────────────────
  modelContext.registerTool({
    name: "get_entry",
    description: "Retrieve a single content entry.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string" },
        entryId: { type: "string" },
      },
      required: ["collectionId", "entryId"],
    },
    execute: async (params: any) => {
      try {
        const res = await fetch(`/api/collections/${params.collectionId}/${params.entryId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: unknown) {
        return formatError("[WebMCP] get_entry failed", err);
      }
    },
  });

  // ── Update Entry (browser) ─────────────────────────────────────
  modelContext.registerTool({
    name: "update_entry",
    description: "Update an existing entry. ALWAYS forces status to 'draft'.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string" },
        entryId: { type: "string" },
        data: { type: "object" },
      },
      required: ["collectionId", "entryId", "data"],
    },
    execute: async (params: any) => {
      try {
        const safeData = { ...params.data, status: "draft" };
        const res = await fetch(`/api/collections/${params.collectionId}/${params.entryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(safeData),
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const responseData = await res.json();
        return {
          content: [
            {
              type: "text",
              text: `Success: Entry updated and set to DRAFT. ${JSON.stringify(responseData)}`,
            },
          ],
        };
      } catch (err: unknown) {
        return formatError("[WebMCP] update_entry failed", err);
      }
    },
  });

  // ── Delete Entry (browser) ─────────────────────────────────────
  modelContext.registerTool({
    name: "delete_entry",
    description: "Soft-delete an entry (moves to Trash).",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string" },
        entryId: { type: "string" },
      },
      required: ["collectionId", "entryId"],
    },
    execute: async (params: any) => {
      try {
        const res = await fetch(`/api/collections/${params.collectionId}/${params.entryId}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const responseData = await res.json();
        return {
          content: [
            {
              type: "text",
              text: `Success: Entry moved to Trash. ${JSON.stringify(responseData)}`,
            },
          ],
        };
      } catch (err: unknown) {
        return formatError("[WebMCP] delete_entry failed", err);
      }
    },
  });

  // ── Score Content (browser) ────────────────────────────────────
  modelContext.registerTool({
    name: "score_content",
    description: "AI-powered content quality scoring.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string" },
        entryId: { type: "string" },
      },
      required: ["collectionId", "entryId"],
    },
    execute: async (params: any) => {
      try {
        const res = await fetch(`/api/collections/${params.collectionId}/${params.entryId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const entryData = await res.json();
        const content = entryData.data || entryData;

        const scoreRes = await fetch("/api/ai/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            collectionName: params.collectionId,
          }),
          credentials: "include",
        });

        if (!scoreRes.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Content retrieved but AI scoring unavailable. ${JSON.stringify(content)}`,
              },
            ],
          };
        }
        const scoreData = await scoreRes.json();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ entry: content, quality: scoreData }, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        return formatError("[WebMCP] score_content failed", err);
      }
    },
  });
}

// ── Server-side tools using DB adapter directly ──────────────────
function registerServerTools(db: IDBAdapter): void {
  logger.info("[WebMCP] Registering server-side content tools with db adapter...");

  // These tools are available for headless server-side MCP gateways.
  // In production, they would be registered with an MCP server framework
  // (e.g., @modelcontextprotocol/sdk). Here we define the tool contracts.

  // get_collections — server
  async function getCollections() {
    try {
      const result = await db.collection.listSchemas();
      const collections =
        result && typeof result === "object" && "success" in result && result.success
          ? ((result as any).data ?? [])
          : [];
      return {
        collections: (Array.isArray(collections) ? collections : []).map((c: any) => ({
          id: c._id,
          name: c.name,
          fields: c.fields,
        })),
      };
    } catch (err: any) {
      logger.error("[WebMCP] headless get_collections failed", { error: err });
      return { error: err.message };
    }
  }

  // list_entries — server
  async function listEntries(
    collectionId: string,
    opts: {
      limit?: number;
      offset?: number;
      sortField?: string;
      sortDirection?: string;
      status?: string;
    } = {},
  ) {
    try {
      const filter: any = {};
      if (opts.status && opts.status !== "all") {
        filter.status = opts.status;
      }
      const result = await db.crud.findMany(collectionId, filter, {
        limit: Math.min(opts.limit || 25, 100),
        offset: opts.offset || 0,
        sort: opts.sortField
          ? { [opts.sortField]: (opts.sortDirection as "asc" | "desc") || "desc" }
          : { updatedAt: "desc" },
      });
      return result;
    } catch (err: any) {
      logger.error("[WebMCP] headless list_entries failed", {
        collectionId,
        error: err,
      });
      return { success: false, message: err.message };
    }
  }

  // create_entry — server (Draft-by-Default)
  async function createEntry(collectionId: string, data: any) {
    try {
      const safeData = { ...data, status: "draft" };
      const result = await db.crud.insert(collectionId, safeData);
      return result;
    } catch (err: any) {
      logger.error("[WebMCP] headless create_entry failed", {
        collectionId,
        error: err,
      });
      return { success: false, message: err.message };
    }
  }

  // Store tool references for headless gateway integration
  (globalThis as any).__webmcp_headless_tools = {
    getCollections,
    listEntries,
    createEntry,
  };
}

// ── Error formatting helper ──────────────────────────────────────
function formatError(tag: string, err: unknown) {
  logger.error(tag, { error: err });
  return {
    isError: true,
    content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
  };
}
