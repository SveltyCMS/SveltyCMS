/**
 * @file tests/unit/services/ai-builder/schema-ast.test.ts
 * @description Unit tests for the Phase 1 collection schema AST generator.
 */

import { describe, expect, it } from "vitest";
import { generateCollectionSourceFromProposal } from "@src/services/ai-builder/schema-ast";
import { AppError } from "@utils/error-handling";
import type { CollectionDesignProposal } from "@src/services/ai-builder/types";

const proposal: CollectionDesignProposal = {
  name: "Blog Post",
  slug: "blog-post",
  label: "Blog Post",
  description: "A blog post",
  fields: [
    {
      name: "title",
      label: "Title",
      widget: "Input",
      type: "string",
      required: true,
      translated: true,
    },
    { name: "body", widget: "RichText", required: false, translated: false },
  ],
};

describe("generateCollectionSourceFromProposal", () => {
  it("emits a typed schema with widget factory calls", () => {
    const source = generateCollectionSourceFromProposal(proposal, {
      displayPath: "config/collections/blog-post.ts",
    });
    expect(source).toContain("@file config/collections/blog-post.ts");
    expect(source).toContain("import { widgets } from '@widgets/widget-manager.svelte'");
    expect(source).toContain("export const schema: Schema");
    expect(source).toContain('_id: "blog-post"');
    expect(source).toContain('status: "draft"');
    expect(source).toContain("widgets.Input(");
    expect(source).toContain("widgets.RichText(");
    expect(source).toContain('db_fieldName: "title"');
    expect(source).toContain("required: true");
    expect(source).toContain("translated: true");
  });

  it("rejects non-identifier widget names", () => {
    expect(() =>
      generateCollectionSourceFromProposal(
        {
          ...proposal,
          fields: [{ name: "title", widget: "Input-Widget", required: true }],
        },
        { displayPath: "config/collections/x.ts" },
      ),
    ).toThrow(AppError);
  });
});
