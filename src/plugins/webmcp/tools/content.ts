/**
 * @file src/plugins/webmcp/tools/content.ts
 * @description Secure, schema-aware content tools for WebMCP.
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
        return { isError: true, content: [{ type: "text", text: err.message }] };
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
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        logger.error("[WebMCP] get_entry failed", { collectionId, entryId, error: err });
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
    },
  });
}
