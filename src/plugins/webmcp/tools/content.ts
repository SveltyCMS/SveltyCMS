/**
 * @file src/plugins/webmcp/tools/content.ts
 * @description Secure, schema-aware content tools for WebMCP.
 *
 * Features:
 * - Full CRUD: list, search, get, create, update, delete
 * - Draft-by-Default Airgap on all mutations
 * - Content quality scoring via AIService
 * - Trash-aware soft-delete
 */

import { contentStore } from "@src/stores/content-store.svelte";
import { logger } from "@utils/logger";

function getModelContext() {
  return (window.navigator as any)?.modelContext;
}

export function registerContentTools() {
  const modelContext = getModelContext();
  if (!modelContext) return;

  // ── Get Collections ─────────────────────────────────────
  modelContext.registerTool({
    name: "get_collections",
    description: "Returns all content collections with their schemas and field definitions.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async () => {
      try {
        const collections = contentStore.getAllCollections();
        const list = collections.map((c: any) => ({
          id: c._id,
          name: c.name,
          description: c.description || "",
          fields: c.fields?.map((f: any) => ({
            name: f.db_fieldName || f.name,
            label: f.label,
            type: f.widget?.Name || f.type,
            required: !!f.required,
          })),
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(list, null, 2) }],
        };
      } catch (err: any) {
        logger.error("[WebMCP] get_collections failed", { error: err });
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: err.message,
            },
          ],
        };
      }
    },
  });

  // ── List Entries (Paginated) ────────────────────────────
  modelContext.registerTool({
    name: "list_entries",
    description:
      "List entries in a collection with pagination, sorting, and filtering. Returns paginated results.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "Collection ID or slug" },
        limit: {
          type: "number",
          description: "Max entries to return (default: 25, max: 100)",
        },
        offset: {
          type: "number",
          description: "Number of entries to skip (default: 0)",
        },
        sortField: {
          type: "string",
          description: "Field to sort by (default: updatedAt)",
        },
        sortDirection: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort direction (default: desc)",
        },
        status: {
          type: "string",
          enum: ["published", "draft", "all"],
          description: "Filter by publication status (default: all)",
        },
      },
      required: ["collectionId"],
    },
    execute: async ({
      collectionId,
      limit = 25,
      offset = 0,
      sortField = "updatedAt",
      sortDirection = "desc",
      status = "all",
    }: {
      collectionId: string;
      limit?: number;
      offset?: number;
      sortField?: string;
      sortDirection?: string;
      status?: string;
    }) => {
      try {
        // Cap limit to prevent excessive data transfer to AI context
        const safeLim = Math.min(Math.max(1, limit), 100);
        const params = new URLSearchParams({
          limit: String(safeLim),
          offset: String(Math.max(0, offset)),
          sortField,
          sortDirection,
          ...(status !== "all" ? { publicationFilter: status } : {}),
        });

        const res = await fetch(`/api/collections/${collectionId}?${params}`, {
          credentials: "include",
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: unknown) {
        logger.error("[WebMCP] list_entries failed", {
          collectionId,
          error: err,
        });
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

  // ── Search Entries ──────────────────────────────────────
  modelContext.registerTool({
    name: "search_entries",
    description:
      "Search across one or more collections using full-text search. Returns matching entries with relevance.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string" },
        collections: {
          type: "string",
          description: "Comma-separated collection IDs to search (omit to search all)",
        },
        limit: {
          type: "number",
          description: "Max results (default: 25, max: 50)",
        },
      },
      required: ["query"],
    },
    execute: async ({
      query,
      collections,
      limit = 25,
    }: {
      query: string;
      collections?: string;
      limit?: number;
    }) => {
      try {
        const safeLim = Math.min(Math.max(1, limit), 50);
        const params = new URLSearchParams({
          q: query,
          limit: String(safeLim),
        });
        if (collections) params.set("collections", collections);

        const res = await fetch(`/api/collections/search?${params}`, {
          credentials: "include",
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: unknown) {
        logger.error("[WebMCP] search_entries failed", { query, error: err });
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

  // ── Create Entry (Draft-by-Default Airgap) ───────────────
  modelContext.registerTool({
    name: "create_entry",
    description:
      "Create a new content entry. ALWAYS saves as 'draft' to prevent unauthorized publishing by AI agents.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "Collection ID or slug" },
        data: { type: "object", description: "Entry data payload" },
      },
      required: ["collectionId", "data"],
    },
    execute: async ({ collectionId, data }: { collectionId: string; data: any }) => {
      try {
        // Enforce Draft-by-Default Airgap
        const safeData = { ...data, status: "draft" };

        const res = await fetch(`/api/collections/${collectionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(safeData),
          credentials: "include",
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const responseData = await res.json();
        return {
          content: [
            {
              type: "text",
              text: `Success: Entry created in DRAFT mode. JSON: ${JSON.stringify(responseData)}`,
            },
          ],
        };
      } catch (err: unknown) {
        logger.error("[WebMCP] create_entry failed", {
          collectionId,
          error: err,
        });
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

  // ── Get Entry ───────────────────────────────────────────
  modelContext.registerTool({
    name: "get_entry",
    description: "Retrieve a single content entry by collection and ID.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "Collection ID or slug" },
        entryId: { type: "string", description: "Entry ID" },
      },
      required: ["collectionId", "entryId"],
    },
    execute: async ({ collectionId, entryId }: { collectionId: string; entryId: string }) => {
      try {
        const res = await fetch(`/api/collections/${collectionId}/${entryId}`, {
          credentials: "include",
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: unknown) {
        logger.error("[WebMCP] get_entry failed", {
          collectionId,
          entryId,
          error: err,
        });
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

  // ── Update Entry (Draft-by-Default Airgap) ──────────────
  modelContext.registerTool({
    name: "update_entry",
    description:
      "Update an existing content entry. ALWAYS forces status to 'draft' to prevent unauthorized publishing by AI agents. Human review required to publish.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "Collection ID or slug" },
        entryId: { type: "string", description: "Entry ID to update" },
        data: {
          type: "object",
          description: "Fields to update (partial update supported)",
        },
      },
      required: ["collectionId", "entryId", "data"],
    },
    execute: async ({
      collectionId,
      entryId,
      data,
    }: {
      collectionId: string;
      entryId: string;
      data: any;
    }) => {
      try {
        // Enforce Draft-by-Default Airgap — AI cannot publish
        const safeData = { ...data, status: "draft" };

        const res = await fetch(`/api/collections/${collectionId}/${entryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(safeData),
          credentials: "include",
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const responseData = await res.json();
        return {
          content: [
            {
              type: "text",
              text: `Success: Entry updated and set to DRAFT. Human review required to publish. JSON: ${JSON.stringify(responseData)}`,
            },
          ],
        };
      } catch (err: unknown) {
        logger.error("[WebMCP] update_entry failed", {
          collectionId,
          entryId,
          error: err,
        });
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

  // ── Delete Entry (Soft Delete — Trash Recovery Aware) ───
  modelContext.registerTool({
    name: "delete_entry",
    description:
      "Soft-delete a content entry (moves to Trash). Entry can be recovered by an admin. Permanent deletion is NOT available via AI agents.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "Collection ID or slug" },
        entryId: { type: "string", description: "Entry ID to delete" },
      },
      required: ["collectionId", "entryId"],
    },
    execute: async ({ collectionId, entryId }: { collectionId: string; entryId: string }) => {
      try {
        // Never pass permanent=true — AI agents can only soft-delete
        const res = await fetch(`/api/collections/${collectionId}/${entryId}`, {
          method: "DELETE",
          credentials: "include",
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const responseData = await res.json();
        return {
          content: [
            {
              type: "text",
              text: `Success: Entry moved to Trash (soft-deleted). Recoverable by admin. JSON: ${JSON.stringify(responseData)}`,
            },
          ],
        };
      } catch (err: unknown) {
        logger.error("[WebMCP] delete_entry failed", {
          collectionId,
          entryId,
          error: err,
        });
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

  // ── Score Content (AI Co-Pilot) ─────────────────────────
  modelContext.registerTool({
    name: "score_content",
    description:
      "AI-powered content quality scoring. Evaluates an entry for SEO, readability, and completeness. Returns score, suggestions, and sub-scores. Requires Ollama to be running.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "Collection ID or slug" },
        entryId: { type: "string", description: "Entry ID to score" },
      },
      required: ["collectionId", "entryId"],
    },
    execute: async ({ collectionId, entryId }: { collectionId: string; entryId: string }) => {
      try {
        // Fetch the entry first
        const res = await fetch(`/api/collections/${collectionId}/${entryId}`, {
          credentials: "include",
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const entryData = await res.json();
        const content = entryData.data || entryData;

        // Call AI scoring endpoint
        const scoreRes = await fetch("/api/ai/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, collectionName: collectionId }),
          credentials: "include",
        });

        if (!scoreRes.ok) {
          // Graceful fallback if AI endpoint isn't available
          return {
            content: [
              {
                type: "text",
                text: `Content retrieved but AI scoring unavailable (HTTP ${scoreRes.status}). Entry data: ${JSON.stringify(content, null, 2)}`,
              },
            ],
          };
        }

        const scoreData = await scoreRes.json();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  entry: content,
                  quality: scoreData,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        logger.error("[WebMCP] score_content failed", {
          collectionId,
          entryId,
          error: err,
        });
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
}
