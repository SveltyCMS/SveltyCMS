/**
 * @file tests/unit/plugins/webmcp-builder.test.ts
 * @description Unit tests for WebMCP headless builder tools.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { registerBuilderServerTools } from "@src/plugins/webmcp/tools/builder.server";
import {
  getServerTool,
  searchServerTools,
  listServerTools,
} from "@src/plugins/webmcp/tool-registry";

describe("WebMCP Builder Tools", () => {
  beforeEach(() => {
    registerBuilderServerTools();
  });

  it("registers builder tools in the server registry", () => {
    const designTool = getServerTool("design_collection");
    expect(designTool).toBeDefined();
    expect(designTool?.name).toBe("design_collection");
    expect(designTool?.parameters?.prompt).toBeDefined();

    const refineTool = getServerTool("refine_collection");
    expect(refineTool).toBeDefined();
    expect(refineTool?.name).toBe("refine_collection");

    const diffTool = getServerTool("diff_collection_schema");
    expect(diffTool).toBeDefined();

    const scaffoldTool = getServerTool("scaffold_widget");
    expect(scaffoldTool).toBeDefined();

    const listWidgetsTool = getServerTool("list_available_widgets");
    expect(listWidgetsTool).toBeDefined();
  });

  it("discovers builder tools via searchServerTools", () => {
    const searchDesign = searchServerTools("design");
    expect(searchDesign.some((t) => t.name === "design_collection")).toBe(true);

    const searchScaffold = searchServerTools("scaffold");
    expect(searchScaffold.some((t) => t.name === "scaffold_widget")).toBe(true);

    const searchSchema = searchServerTools("schema");
    expect(searchSchema.some((t) => t.name === "diff_collection_schema")).toBe(true);
  });

  it("executes diff_collection_schema tool successfully", async () => {
    const diffTool = getServerTool("diff_collection_schema");
    expect(diffTool).toBeDefined();

    const mockCurrent = {
      name: "posts",
      description: "Blog posts",
      fields: [{ name: "title", widget: "input", required: true }],
    };

    const mockProposal = {
      name: "posts",
      description: "Blog posts updated",
      fields: [
        { name: "title", widget: "input", required: true },
        { name: "tags", widget: "input", required: false },
      ],
    };

    const result = (await (diffTool!.handler as (input: unknown) => Promise<any>)({
      current: mockCurrent,
      proposal: mockProposal,
    })) as {
      success: boolean;
      diff: { added: unknown[]; removed: unknown[]; modified: unknown[] };
    };

    expect(result.success).toBe(true);
    expect(result.diff.added).toBeDefined();
    expect(result.diff.added.some((f: any) => f.name === "tags")).toBe(true);
  });

  it("exports all tools in listServerTools catalog", () => {
    const all = listServerTools();
    const names = all.map((t) => t.name);
    expect(names).toContain("design_collection");
    expect(names).toContain("refine_collection");
    expect(names).toContain("diff_collection_schema");
    expect(names).toContain("scaffold_widget");
    expect(names).toContain("list_available_widgets");
  });
});
