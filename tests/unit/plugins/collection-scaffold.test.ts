/**
 * @vitest-environment node
 * @file tests/unit/plugins/collection-scaffold.test.ts
 * @description Unit tests for migration collection auto-scaffold helpers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import {
  normalizeCollectionId,
  importTypeToWidget,
  buildCollectionSchemaFromMappings,
  generateCollectionSourceFile,
  provisionCollectionFromMappings,
} from "@plugins/smart-importer/collection-scaffold";

const mockGetCollection = vi.fn();
const mockRefresh = vi.fn();
const mockCompile = vi.fn();
const mockMarkFileDirty = vi.fn();
const mockGetCollectionFilePath = vi.fn();
const mockGetCollectionDisplayPath = vi.fn();

vi.mock("@src/content/index.server", () => ({
  contentSystem: {
    getCollection: (...args: unknown[]) => mockGetCollection(...args),
    refresh: (...args: unknown[]) => mockRefresh(...args),
  },
}));

vi.mock("@src/content/engine.server", () => ({
  markFileDirty: (...args: unknown[]) => mockMarkFileDirty(...args),
}));

vi.mock("@src/utils/compilation/compile", () => ({
  compile: (...args: unknown[]) => mockCompile(...args),
}));

vi.mock("@utils/tenant.server", () => ({
  getCollectionFilePath: (...args: unknown[]) => mockGetCollectionFilePath(...args),
  getCollectionDisplayPath: (...args: unknown[]) => mockGetCollectionDisplayPath(...args),
}));

describe("collection-scaffold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCollection.mockReturnValue(undefined);
    mockRefresh.mockResolvedValue(undefined);
    mockCompile.mockResolvedValue(undefined);
    mockGetCollectionFilePath.mockReturnValue("/tmp/test-collections/posts.ts");
    mockGetCollectionDisplayPath.mockReturnValue("config/collections/posts.ts");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizeCollectionId sanitizes names", () => {
    expect(normalizeCollectionId("My Posts")).toBe("my_posts");
    expect(normalizeCollectionId("  Articles & News!  ")).toBe("articles_news");
    expect(normalizeCollectionId("")).toBe("imported_content");
    expect(normalizeCollectionId("___")).toBe("imported_content");
  });

  it("importTypeToWidget maps importer types to widgets", () => {
    expect(importTypeToWidget("richtext")).toEqual({ Name: "RichText", fieldType: "string" });
    expect(importTypeToWidget("media")).toEqual({ Name: "MediaUpload", fieldType: "string" });
    expect(importTypeToWidget("number")).toEqual({ Name: "Number", fieldType: "number" });
    expect(importTypeToWidget("unknown")).toEqual({ Name: "Input", fieldType: "string" });
  });

  it("buildCollectionSchemaFromMappings builds schema with mapped fields", () => {
    const schema = buildCollectionSchemaFromMappings(
      "blog_posts",
      [
        { source: "post_title", target: "title", type: "text" },
        { source: "content", target: "body", type: "richtext" },
        { source: "_thumbnail", target: "featuredImage", type: "media" },
      ],
      "wordpress",
    );

    expect(schema._id).toBe("blog_posts");
    expect(schema.slug).toBe("blog_posts");
    expect(schema.description).toContain("wordpress");
    expect(schema.fields.some((f) => f.name === "title" && f.widget.Name === "Input")).toBe(true);
    expect(schema.fields.some((f) => f.name === "body" && f.widget.Name === "RichText")).toBe(true);
    expect(
      schema.fields.some((f) => f.name === "featuredImage" && f.widget.Name === "MediaUpload"),
    ).toBe(true);
  });

  it("generateCollectionSourceFile emits valid TS export", () => {
    const schema = buildCollectionSchemaFromMappings(
      "posts",
      [{ source: "title", target: "title", type: "text" }],
      "wordpress",
    );
    const source = generateCollectionSourceFile(schema, "config/collections/posts.ts");
    expect(source).toContain("export const schema");
    expect(source).toContain("@file config/collections/posts.ts");
    expect(source).toContain('"posts"');
  });

  it("provisionCollectionFromMappings skips when collection already exists", async () => {
    mockGetCollection.mockReturnValue({
      _id: "posts",
      fields: [{ name: "title", widget: { Name: "Input" } }],
    });

    const writeSpy = vi.spyOn(fs, "writeFileSync");
    const db = { collection: { createModel: vi.fn() } };

    const result = await provisionCollectionFromMappings(
      db,
      "default",
      "posts",
      [{ source: "title", target: "title", type: "text" }],
      "wordpress",
    );

    expect(result.created).toBe(false);
    expect(result.collectionId).toBe("posts");
    expect(writeSpy).not.toHaveBeenCalled();
    expect(mockCompile).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  it("provisionCollectionFromMappings writes file and runs compile pipeline", async () => {
    const mkdirSpy = vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

    const createModel = vi.fn().mockResolvedValue(undefined);
    const db = { collection: { createModel } };

    const result = await provisionCollectionFromMappings(
      db,
      null,
      "my_articles",
      [
        { source: "title", target: "title", type: "text" },
        { source: "body", target: "content", type: "richtext" },
      ],
      "drupal",
    );

    expect(result.created).toBe(true);
    expect(result.collectionId).toBe("my_articles");
    expect(result.fieldCount).toBeGreaterThan(0);
    expect(writeSpy).toHaveBeenCalled();
    expect(mockMarkFileDirty).toHaveBeenCalledWith("/tmp/test-collections/posts.ts");
    expect(mockCompile).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalledWith(null);
    expect(createModel).toHaveBeenCalled();

    mkdirSpy.mockRestore();
    existsSpy.mockRestore();
    writeSpy.mockRestore();
  });
});
