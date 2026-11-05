/**
 * @file tests/unit/plugins/webmcp-agent-instructions.test.ts
 * @description Unit tests for WebMCP AI agent instruction and schema inspection tools.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { registerContentTools } from "@src/plugins/webmcp/tools/content";
import { getServerTool, searchServerTools } from "@src/plugins/webmcp/tool-registry";
import type { IDBAdapter } from "@src/databases/db-interface";

describe("WebMCP Agent Instructions & Schema Tools", () => {
  const mockSchemas = [
    {
      _id: "posts_col",
      name: "posts",
      label: "Blog Posts",
      description: "Editorial blog articles",
      instructions: "Ensure all articles have concise summaries and SEO-friendly titles.",
      fields: [
        {
          name: "title",
          widget: "input",
          required: true,
          instructions: "Keep under 70 characters.",
        },
        {
          name: "content",
          widget: "richText",
          required: true,
        },
      ],
      singleton: false,
      status: "published",
    },
    {
      _id: "authors_col",
      name: "authors",
      label: "Authors",
      agentInstructions: "Authors must be linked to active staff profiles.",
      fields: [
        {
          name: "bio",
          widget: "textarea",
          agentInstructions: "Write in the third person.",
        },
      ],
    },
  ];

  const mockDbAdapter = {
    collection: {
      listSchemas: vi.fn(async () => ({ success: true, data: mockSchemas })),
      getSchema: vi.fn(async (id: string) => {
        const found = mockSchemas.find((s) => s._id === id || s.name === id);
        return found ? { success: true, data: found } : null;
      }),
    },
    crud: {
      findMany: vi.fn(async () => ({ success: true, data: [] })),
      insert: vi.fn(async (_col: string, data: any) => ({ success: true, data })),
    },
  } as unknown as IDBAdapter;

  beforeEach(() => {
    registerContentTools(mockDbAdapter);
  });

  it("registers get_collections, get_collection_schema and get_agent_instructions", () => {
    const listTool = getServerTool("get_collections");
    expect(listTool).toBeDefined();

    const schemaTool = getServerTool("get_collection_schema");
    expect(schemaTool).toBeDefined();
    expect(schemaTool?.parameters?.collectionId).toBeDefined();

    const instructionsTool = getServerTool("get_agent_instructions");
    expect(instructionsTool).toBeDefined();
  });

  it("discovers agent instruction tools via searchServerTools", () => {
    const results = searchServerTools("instructions");
    expect(results.some((t) => t.name === "get_agent_instructions")).toBe(true);

    const schemaResults = searchServerTools("schema");
    expect(schemaResults.some((t) => t.name === "get_collection_schema")).toBe(true);
  });

  it("get_collections exposes schema and field agent instructions", async () => {
    const tool = getServerTool("get_collections");
    const result = (await tool!.handler()) as any;

    expect(result.collections).toHaveLength(2);
    expect(result.collections[0].instructions).toBe(
      "Ensure all articles have concise summaries and SEO-friendly titles.",
    );
    expect(result.collections[0].fields[0].instructions).toBe("Keep under 70 characters.");
    expect(result.collections[1].instructions).toBe(
      "Authors must be linked to active staff profiles.",
    );
    expect(result.collections[1].fields[0].instructions).toBe("Write in the third person.");
  });

  it("get_collection_schema returns detailed schema with instructions", async () => {
    const tool = getServerTool("get_collection_schema");
    const result = (await (tool!.handler as any)("posts")) as any;

    expect(result.name).toBe("posts");
    expect(result.label).toBe("Blog Posts");
    expect(result.instructions).toBe(
      "Ensure all articles have concise summaries and SEO-friendly titles.",
    );
    expect(result.fields).toHaveLength(2);
  });

  it("get_agent_instructions returns scoped instructions for AI agents", async () => {
    const tool = getServerTool("get_agent_instructions");

    // Single collection query
    const singleResult = (await (tool!.handler as any)("posts")) as any;
    expect(singleResult.collection).toBe("posts");
    expect(singleResult.instructions).toContain("Ensure all articles");
    expect(singleResult.fieldInstructions).toEqual([
      { field: "title", instructions: "Keep under 70 characters." },
    ]);

    // All collections query
    const allResult = (await (tool!.handler as any)()) as any;
    expect(allResult.instructions).toHaveLength(2);
    expect(allResult.instructions[0].collection).toBe("posts");
    expect(allResult.instructions[1].collection).toBe("authors");
  });
});
