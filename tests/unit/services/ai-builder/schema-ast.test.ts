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

/** Header text up to (but excluding) the first comment terminator. */
function headerOf(source: string): string {
  return source.slice(0, source.indexOf("*/"));
}

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

  it("neutralizes a comment terminator injected through the label", () => {
    const source = generateCollectionSourceFromProposal(
      { ...proposal, label: "Foo */ export const pwned = true; /*" },
      { displayPath: "config/collections/blog-post.ts" },
    );
    const closeIndex = source.indexOf("*/");
    const header = source.slice(0, closeIndex);
    const body = source.slice(closeIndex + 2);

    expect(source.startsWith("/**")).toBe(true);
    expect(header).toContain("Foo * / export const pwned = true; / *");
    // The header close is still the first terminator; the injected code is not body text.
    expect(header).toContain("- draft-gated until published in Collection Builder");
    expect(body.trimStart().startsWith("import ")).toBe(true);
    expect(source).toContain("export const schema: Schema");
  });

  it("caps a long label in the header", () => {
    const longLabel = "A".repeat(500);
    const source = generateCollectionSourceFromProposal(
      { ...proposal, label: longLabel },
      { displayPath: "config/collections/blog-post.ts" },
    );
    const header = headerOf(source);

    expect(header).toContain(`Collection file for ${"A".repeat(200)}`);
    expect(header).not.toContain("A".repeat(201));
  });

  it("leaves a normal label unchanged", () => {
    const source = generateCollectionSourceFromProposal(proposal, {
      displayPath: "config/collections/blog-post.ts",
    });

    expect(headerOf(source)).toContain("@description Collection file for Blog Post");
  });

  it("neutralizes a comment terminator injected through displayPath", () => {
    const source = generateCollectionSourceFromProposal(proposal, {
      displayPath: "config/collections/x */ pwned /*.ts",
    });
    const header = headerOf(source);

    expect(source.startsWith("/**")).toBe(true);
    expect(header).toContain("@file config/collections/x * / pwned / *.ts");
    expect(header).toContain("- draft-gated until published in Collection Builder");
    expect(source).toContain("export const schema: Schema");
  });
});
