/**
 * @file src/plugins/webmcp/tools/content.ts
 * @description Exposes Content Management tools to WebMCP (Hardened & Schema-Aware)
 */

import { collections } from "@src/stores/collection-store.svelte";
import { app } from "@src/stores/store.svelte.ts";

export function registerContentTools() {
  const modelContext = (window as any).navigator.modelContext;

  if (!modelContext) {
    return;
  }

  // Tool: get_collections
  // Enhanced to provide full context for AI reasoning
  modelContext.registerTool({
    name: "get_collections",
    description:
      "Get a list of all available content collections, their schemas, and field definitions.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async () => {
      // Filter out system collections and provide meaningful schema info
      const collectionList = collections.all.map((c: any) => ({
        id: c._id,
        name: c.name,
        label: c.label || c.name,
        icon: c.icon,
        description: c.description || "",
        fields: c.fields.map((f: any) => ({
          name: f.db_fieldName,
          label: f.label,
          type: f.widget.Name,
          required: f.required || false,
          helper: f.helper || "",
        })),
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(collectionList, null, 2),
          },
        ],
      };
    },
  });

  // Tool: get_entry_details
  modelContext.registerTool({
    name: "get_entry_details",
    description: "Get the full data of a specific content entry by its ID.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "The ID or name of the collection" },
        entryId: { type: "string", description: "The ID of the entry to retrieve" },
      },
      required: ["collectionId", "entryId"],
    },
    execute: async ({ collectionId, entryId }: { collectionId: string; entryId: string }) => {
      try {
        const lang = app.contentLanguage;
        const res = await fetch(`/${lang}/api/collections/${collectionId}/${entryId}`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
    },
  });

  // Tool: create_entry
  // The "Ghost Data" spawning engine
  modelContext.registerTool({
    name: "create_entry",
    description:
      "Create a new entry in a collection. AI should use this to 'ghost-spawn' draft data.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "The ID or name of the collection" },
        data: { type: "object", description: "The entry data matching the collection schema" },
      },
      required: ["collectionId", "data"],
    },
    execute: async ({ collectionId, data }: { collectionId: string; data: any }) => {
      try {
        const lang = app.contentLanguage;
        const res = await fetch(`/${lang}/api/collections/${collectionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data, status: "draft" }), // Default to draft for AI-generated content
        });
        const result = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
    },
  });

  // Tool: update_entry
  modelContext.registerTool({
    name: "update_entry",
    description: "Update an existing entry in a collection.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "The ID or name of the collection" },
        entryId: { type: "string", description: "The ID of the entry to update" },
        data: { type: "object", description: "The partial entry data to update" },
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
        const lang = app.contentLanguage;
        const res = await fetch(`/${lang}/api/collections/${collectionId}/${entryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
        });
        const result = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
    },
  });

  // Tool: search_content
  modelContext.registerTool({
    name: "search_content",
    description: "Search for content entries in a specific collection.",
    parameters: {
      type: "object",
      properties: {
        collectionId: {
          type: "string",
          description: "The ID or name of the collection to search",
        },
        query: { type: "string", description: "Search query" },
      },
      required: ["collectionId"],
    },
    execute: async ({ collectionId, query }: { collectionId: string; query: string }) => {
      try {
        const lang = app.contentLanguage;
        const response = await fetch(
          `/${lang}/api/collections/${collectionId}?search=${encodeURIComponent(query || "")}`,
        );
        const data = await response.json();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to fetch content: ${e.message}` }],
        };
      }
    },
  });
}
