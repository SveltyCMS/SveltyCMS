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

import type { BaseEntity, DatabaseId, EntityCreate, IDBAdapter } from "@src/databases/db-interface";
import { clientJsonHeaders } from "@utils/security/client-csrf";
import { logger } from "@utils/logger";
import {
  readOptionalNumberArgument,
  readOptionalStringArgument,
  readRequiredObjectArgument,
  readRequiredStringArgument,
  registerServerTool,
  syncHeadlessToolBag,
} from "../tool-registry";

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
    description:
      "Returns all content collections with their schemas, field definitions, and AI agent instructions.",
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

  // ── Get Collection Schema & Agent Instructions (browser) ───────
  modelContext.registerTool({
    name: "get_collection_schema",
    description:
      "Get detailed schema, field definitions, and AI agent instructions for a specific collection.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "The collection ID or name" },
      },
      required: ["collectionId"],
    },
    execute: async (params: any) => {
      try {
        const res = await fetch(`/api/collections/${params.collectionId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: unknown) {
        return formatError("[WebMCP] get_collection_schema failed", err);
      }
    },
  });

  // ── Get Agent Instructions (browser) ───────────────────────────
  modelContext.registerTool({
    name: "get_agent_instructions",
    description:
      "Get prompt instructions and business guidelines for AI agents working with content schemas.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "Optional collection ID or name" },
      },
      required: [],
    },
    execute: async (params: any) => {
      try {
        const url = params?.collectionId
          ? `/api/collections/${params.collectionId}`
          : "/api/collections";
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: unknown) {
        return formatError("[WebMCP] get_agent_instructions failed", err);
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
          headers: clientJsonHeaders(),
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
          headers: clientJsonHeaders(),
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
          headers: clientJsonHeaders(),
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
          headers: clientJsonHeaders(),
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
  async function getCollections(tenantId?: DatabaseId | null) {
    try {
      const result = await db.collection.listSchemas(tenantId ?? undefined);
      const collections =
        result && typeof result === "object" && "success" in result && result.success
          ? ((result as any).data ?? [])
          : [];
      return {
        collections: (Array.isArray(collections) ? collections : []).map((c: any) => ({
          id: c._id,
          name: c.name,
          label: c.label,
          description: c.description,
          instructions: c.instructions || c.agentInstructions,
          fields: (c.fields || []).map((f: any) => ({
            name: f.name || f.label,
            type: f.type || f.widget,
            required: f.required,
            instructions: f.instructions || f.agentInstructions,
            ...f,
          })),
        })),
      };
    } catch (err: any) {
      logger.error("[WebMCP] headless get_collections failed", { error: err });
      return { error: err.message };
    }
  }

  // get_collection_schema — server
  async function getCollectionSchema(collectionId: string, tenantId?: DatabaseId | null) {
    try {
      const result = await db.collection.getSchema(collectionId, tenantId ?? undefined);
      const schema =
        result && typeof result === "object" && "success" in result && (result as any).success
          ? (result as any).data
          : result;
      if (!schema) {
        return { error: `Collection '${collectionId}' not found` };
      }
      return {
        collectionId: schema._id || schema.name,
        name: schema.name,
        label: schema.label,
        description: schema.description,
        instructions: schema.instructions || schema.agentInstructions,
        fields: schema.fields,
        singleton: schema.singleton,
        status: schema.status,
      };
    } catch (err: any) {
      logger.error("[WebMCP] headless get_collection_schema failed", { collectionId, error: err });
      return { error: err.message };
    }
  }

  // get_agent_instructions — server
  async function getAgentInstructions(collectionId?: string, tenantId?: DatabaseId | null) {
    try {
      const result = await db.collection.listSchemas(tenantId ?? undefined);
      const collections =
        result && typeof result === "object" && "success" in result && (result as any).success
          ? ((result as any).data ?? [])
          : [];
      const list = Array.isArray(collections) ? collections : [];

      if (collectionId) {
        const target = list.find((c: any) => c._id === collectionId || c.name === collectionId);
        if (!target) return { error: `Collection '${collectionId}' not found` };
        return {
          collection: target.name,
          instructions:
            target.instructions ||
            target.agentInstructions ||
            "No custom agent instructions declared for this collection.",
          fieldInstructions: (target.fields || [])
            .filter((f: any) => f.instructions || f.agentInstructions)
            .map((f: any) => ({
              field: f.name || f.label,
              instructions: f.instructions || f.agentInstructions,
            })),
        };
      }

      return {
        instructions: list.map((c: any) => ({
          collection: c.name,
          instructions: c.instructions || c.agentInstructions || null,
          fieldInstructions: (c.fields || [])
            .filter((f: any) => f.instructions || f.agentInstructions)
            .map((f: any) => ({
              field: f.name || f.label,
              instructions: f.instructions || f.agentInstructions,
            })),
        })),
      };
    } catch (err: any) {
      logger.error("[WebMCP] headless get_agent_instructions failed", { error: err });
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
    tenantId?: DatabaseId | null,
  ) {
    try {
      const filter: Record<string, unknown> = {};
      if (opts.status && opts.status !== "all") {
        filter.status = opts.status;
      }
      const result = await db.crud.findMany(collectionId, filter, {
        limit: Math.min(opts.limit || 25, 100),
        offset: opts.offset || 0,
        sort: opts.sortField
          ? { [opts.sortField]: (opts.sortDirection as "asc" | "desc") || "desc" }
          : { updatedAt: "desc" },
        ...(tenantId ? { tenantId } : {}),
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
  async function createEntry(
    collectionId: string,
    data: Record<string, unknown>,
    tenantId?: DatabaseId | null,
  ) {
    try {
      const safeData: Record<string, unknown> = { ...data, status: "draft" };
      // Defense in depth: the token tenant wins even on adapters/paths where a
      // payload-supplied tenantId would otherwise be persisted verbatim.
      delete safeData.tenantId;
      delete safeData.tenant_id;
      // Entry payloads are dynamically shaped; the collection schema validates them.
      const result = await db.crud.insert<BaseEntity>(
        collectionId,
        safeData as EntityCreate<BaseEntity>,
        tenantId ? { tenantId } : undefined,
      );
      return result;
    } catch (err: any) {
      logger.error("[WebMCP] headless create_entry failed", {
        collectionId,
        error: err,
      });
      return { success: false, message: err.message };
    }
  }

  // Register tool contracts with metadata so headless gateways can discover
  // tools search-first (see tool-registry.ts).
  registerServerTool({
    name: "get_collections",
    description:
      "List all content collections with their schemas, fields, and AI agent instructions",
    capability: "read",
    parameters: {},
    required: [],
    invoke: (_args, context) => getCollections(context.tenantId),
    handler: getCollections,
  });
  registerServerTool({
    name: "get_collection_schema",
    description:
      "Get detailed schema, field definitions, validations, and AI agent instructions for a specific collection",
    capability: "read",
    parameters: {
      collectionId: "The collection id or name to fetch schema for",
    },
    required: ["collectionId"],
    invoke: (args, context) =>
      getCollectionSchema(readRequiredStringArgument(args, "collectionId"), context.tenantId),
    handler: getCollectionSchema,
  });
  registerServerTool({
    name: "get_agent_instructions",
    description:
      "Get natural-language prompt instructions and field rules for AI agents working with collections",
    capability: "read",
    parameters: {
      collectionId: "Optional collection id or name to get specific instructions for",
    },
    invoke: (args, context) =>
      getAgentInstructions(readOptionalStringArgument(args, "collectionId"), context.tenantId),
    handler: getAgentInstructions,
  });
  registerServerTool({
    name: "list_entries",
    description:
      "List content entries of a collection with optional limit, offset, sort and status filter",
    capability: "read",
    parameters: {
      collectionId: "The collection id or name to list entries from",
      limit: { type: "number", description: "Max entries to return (capped at 100)" },
      offset: { type: "number", description: "Pagination offset" },
      sortField: "Field to sort by (default updatedAt)",
      sortDirection: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
      status: "Filter by status (e.g. published, draft)",
    },
    required: ["collectionId"],
    invoke: (args, context) =>
      listEntries(
        readRequiredStringArgument(args, "collectionId"),
        {
          limit: readOptionalNumberArgument(args, "limit"),
          offset: readOptionalNumberArgument(args, "offset"),
          sortField: readOptionalStringArgument(args, "sortField"),
          sortDirection: readOptionalStringArgument(args, "sortDirection"),
          status: readOptionalStringArgument(args, "status"),
        },
        context.tenantId,
      ),
    handler: listEntries,
  });
  registerServerTool({
    name: "create_entry",
    description: "Create a new content entry as draft (Draft-by-Default airgap)",
    capability: "write",
    parameters: {
      collectionId: "The collection id or name to create the entry in",
      data: {
        type: "object",
        description: "Entry payload; status is forced to draft",
        additionalProperties: true,
      },
    },
    required: ["collectionId", "data"],
    invoke: (args, context) =>
      createEntry(
        readRequiredStringArgument(args, "collectionId"),
        readRequiredObjectArgument(args, "data"),
        context.tenantId,
      ),
    handler: createEntry,
  });

  // Publish handlers + metadata catalog to the headless gateway globals
  syncHeadlessToolBag();
}

// ── Error formatting helper ──────────────────────────────────────
function formatError(tag: string, err: unknown) {
  logger.error(tag, { error: err });
  return {
    isError: true,
    content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
  };
}
