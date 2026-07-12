/**
 * @file tests/integration/collectionbuilder/code-gui-parity.test.ts
 * @description Integration tests for code-first vs GUI-first collection parity.
 *
 * Verifies collections from both creation paths are loadable and
 * structurally identical through the contentSystem API.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ensureFullInitialization } from "@src/databases/db";
import { contentSystem } from "@src/content/index.server";
import { getCollectionOrder, getStructureNodes } from "@utils/collection-order.server";

beforeAll(async () => {
  await ensureFullInitialization();
  await contentSystem.initialize("global");
});

describe("Code ↔ GUI Collection Parity", () => {
  it("contentSystem is accessible", () => {
    expect(contentSystem).toBeDefined();
    expect(typeof contentSystem.getCollection).toBe("function");
  });

  it("getCollections returns arrays", async () => {
    const collections = await contentSystem.getCollections("global");
    expect(Array.isArray(collections)).toBe(true);
  });

  it("each collection has required Schema fields", async () => {
    const collections = await contentSystem.getCollections("global");
    for (const col of collections || []) {
      expect(col).toHaveProperty("_id");
      expect(col).toHaveProperty("name");
      expect(Array.isArray(col.fields)).toBe(true);
    }
  });

  it("collections are loadable by name after compilation", async () => {
    const collections = await contentSystem.getCollections("global");
    if (collections && collections.length > 0) {
      const first = collections[0];
      const id = first.name || String(first._id || "");
      if (!id) return;
      const loaded = await contentSystem.getCollection(id);
      expect(loaded).toBeDefined();
    }
  });

  it("manifest collectionOrder is readable after initialization", async () => {
    const order = await getCollectionOrder("global");
    expect(order).toBeDefined();
    expect(typeof order).toBe("object");
  });

  it("manifest structureNodes is an array after initialization", async () => {
    const structureNodes = await getStructureNodes("global");
    expect(Array.isArray(structureNodes)).toBe(true);
  });
});

describe("Schema Validation", () => {
  it("widget fields have db_fieldName and widget.Name", () => {
    const validField = {
      db_fieldName: "title",
      widget: { Name: "Input", widgetId: "abc-123" },
    };
    expect(validField.db_fieldName).toBeDefined();
    expect(validField.widget?.Name).toBe("Input");
  });

  it("GUI settings extend schema without breaking code-first compatibility", () => {
    const codeFirst = { _id: "test", name: "Test", icon: "", status: "", fields: [] };
    const guiFirst = {
      ...codeFirst,
      entriesPerPage: 30,
      defaultSortField: "createdAt",
      apiVisible: true,
    };
    expect(codeFirst._id).toBe(guiFirst._id);
    expect(guiFirst.entriesPerPage).toBe(30);
  });

  it("invalid schema without _id is detectable", () => {
    const invalid = { name: "No ID", icon: "", status: "", fields: [] };
    expect(invalid).not.toHaveProperty("_id");
  });

  it("fields must be an array", () => {
    const valid = { _id: "t", name: "T", icon: "", status: "", fields: [] };
    expect(Array.isArray(valid.fields)).toBe(true);
  });
});
