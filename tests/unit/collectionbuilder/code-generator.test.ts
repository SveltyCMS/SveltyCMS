/**
 * @file tests/unit/collectionbuilder/code-generator.test.ts
 * @description Unit tests for client-side collection TypeScript code generator.
 */

import { describe, expect, it } from "vitest";
import { generateCollectionTypeScript } from "@src/routes/(app)/config/collectionbuilder/collection-code-generator";
import type { FieldInstance } from "@src/content/types";

describe("collection-code-generator", () => {
  it("generates minimal defineCollection TypeScript code for empty fields", () => {
    const code = generateCollectionTypeScript({
      _id: "posts",
      name: "Posts",
      icon: "bi:file-text",
      status: "published",
      slug: "posts",
      description: "Blog posts collection",
    });

    expect(code).toContain("import widgets from '@widgets';");
    expect(code).toContain("import { defineCollection } from '@src/content';");
    expect(code).toContain("export default defineCollection({");
    expect(code).toContain('_id: "posts"');
    expect(code).toContain('name: "Posts"');
    expect(code).toContain('icon: "bi:file-text"');
    expect(code).toContain('status: "published"');
    expect(code).toContain('slug: "posts"');
    expect(code).toContain('description: "Blog posts collection"');
    expect(code).toContain("fields: []");
  });

  it("formats fields with widgets correctly", () => {
    const mockFields: FieldInstance[] = [
      {
        label: "Title",
        db_fieldName: "title",
        required: true,
        widget: { Name: "Input" } as any,
      } as FieldInstance,
      {
        label: "Price",
        db_fieldName: "price",
        required: false,
        widget: { Name: "Currency", currency: "USD" } as any,
      } as FieldInstance,
    ];

    const code = generateCollectionTypeScript(
      {
        name: "Products",
      },
      mockFields,
    );

    expect(code).toContain("widgets.Input({");
    expect(code).toContain('label: "Title"');
    expect(code).toContain('db_fieldName: "title"');
    expect(code).toContain("required: true");

    expect(code).toContain("widgets.Currency({");
    expect(code).toContain('label: "Price"');
    expect(code).toContain('db_fieldName: "price"');
    expect(code).toContain('currency: "USD"');
  });
});
