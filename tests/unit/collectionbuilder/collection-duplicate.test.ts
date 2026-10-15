/**
 * @file tests/unit/collectionbuilder/collection-duplicate.test.ts
 * @description Unit tests for the collection-duplicate source rewrite (C1 file-materialization path).
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@sveltejs/kit", () => ({
  error: vi.fn(),
  fail: vi.fn((status: number, data: Record<string, unknown>) => ({
    type: "failure" as const,
    status,
    data,
  })),
  redirect: vi.fn(),
  json: vi.fn(),
}));

vi.mock("@src/databases/auth/permissions", () => ({
  hasCollectionBuilderPermission: vi.fn(() => true),
}));

vi.mock("@utils/page-guards.server", () => ({
  getAuthenticatedUser: vi.fn(() => ({ _id: "admin" })),
}));

vi.mock("@src/routes/(app)/config/collectionbuilder/collectionbuilder-local.server", () => ({
  executeGuiStructureSave: vi.fn(),
  getCollectionBuilderCms: vi.fn(),
  serializeStructureNodes: vi.fn((nodes: unknown[]) => nodes),
}));

import { rewriteCollectionIdentity } from "@src/routes/(app)/config/collectionbuilder/collectionbuilder.server";

describe("rewriteCollectionIdentity", () => {
  it("rewrites preset-style `export default` identity fields, leaving nested field labels intact", () => {
    const source = `export default {
  _id: "posts",
  name: "posts",
  label: "Posts",
  description: "Blog posts",
  icon: "mdi:post",
  fields: [
    { db_fieldName: "title", label: "Title", widget: { Name: "Input" } },
  ],
};`;

    const out = rewriteCollectionIdentity(source, "posts_copy");

    expect(out).toMatch(/_id:\s*"posts_copy"/);
    expect(out).toMatch(/name:\s*"posts_copy"/);
    expect(out).toMatch(/label:\s*"posts_copy"/);
    // Nested widget-field label must NOT be rewritten.
    expect(out).toContain('"Title"');
  });

  it("rewrites editor-style `export const schema` identity fields and slug", () => {
    const source = `export const schema: Schema = {
  _id: "posts",
  name: "posts",
  icon: "",
  status: "",
  description: "",
  slug: "posts",
  fields: [{ label: "Title", db_fieldName: "title", widget: { Name: "Input" } }],
};`;

    const out = rewriteCollectionIdentity(source, "posts_copy");

    expect(out).toMatch(/_id:\s*"posts_copy"/);
    expect(out).toMatch(/name:\s*"posts_copy"/);
    expect(out).toMatch(/slug:\s*"posts-copy"/);
    // Nested widget-field label must NOT be rewritten.
    expect(out).toContain('"Title"');
  });

  it("throws when no root schema object can be located", () => {
    expect(() => rewriteCollectionIdentity("const x = 1;", "nope")).toThrow(/schema object/i);
  });
});
