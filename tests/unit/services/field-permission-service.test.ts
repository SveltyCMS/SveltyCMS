/**
 * @file tests/unit/services/field-permission-service.test.ts
 * @description Unit tests for the field-level permission service.
 *
 * Covers:
 * - Config parsing (object + JSON string + invalid)
 * - Admin fast-path (always full access)
 * - Per-role field filtering (single entry)
 * - Body shapes: { data: [] }, { data: {} }, bare array, bare object
 * - _id always preserved
 * - No policy / no role → pass-through
 * - Collection extraction from /api/collections, /api/content, /api/local/*
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyFieldPermissionsToBody,
  filterEntryFields,
  getCollectionFromPath,
  invalidateFieldPermissionCache,
} from "@src/services/security/field-permission-service";

// Mock settings-service — getPrivateSettingSync returns the injected config.
let mockConfig: unknown = null;
vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn(() => mockConfig),
}));

describe("field-permission-service", () => {
  beforeEach(() => {
    mockConfig = null;
    invalidateFieldPermissionCache();
  });

  describe("getCollectionFromPath", () => {
    it("extracts from /api/collections/{name}", () => {
      expect(getCollectionFromPath("/api/collections/posts/123")).toBe("posts");
      expect(getCollectionFromPath("/api/collections/posts")).toBe("posts");
    });

    it("extracts from /api/content/{name}", () => {
      expect(getCollectionFromPath("/api/content/articles")).toBe("articles");
    });

    it("extracts from /api/local/collections/{name}", () => {
      expect(getCollectionFromPath("/api/local/collections/posts")).toBe("posts");
    });

    it("returns null for non-collection paths", () => {
      expect(getCollectionFromPath("/api/system/health")).toBeNull();
      expect(getCollectionFromPath("/dashboard")).toBeNull();
      expect(getCollectionFromPath("/api/auth/login")).toBeNull();
    });
  });

  describe("filterEntryFields", () => {
    it("strips disallowed fields per role", () => {
      mockConfig = { posts: { editor: ["title", "body"] } };
      const entry = { _id: "1", title: "Hello", body: "World", internal_notes: "secret" };
      const out = filterEntryFields(entry, "posts", "editor");
      expect(out).toEqual({ _id: "1", title: "Hello", body: "World" });
    });

    it("preserves _id even when not listed", () => {
      mockConfig = { posts: { editor: ["title"] } };
      const entry = { _id: "1", title: "Hello", body: "World" };
      expect(filterEntryFields(entry, "posts", "editor")).toEqual({ _id: "1", title: "Hello" });
    });

    it("admins always keep every field", () => {
      mockConfig = { posts: { editor: ["title"] } };
      const entry = { _id: "1", title: "Hello", internal_notes: "secret" };
      expect(filterEntryFields(entry, "posts", "editor", true)).toEqual(entry);
    });

    it("roles without a policy keep full access", () => {
      mockConfig = { posts: { editor: ["title"] } };
      const entry = { _id: "1", title: "Hello", body: "World" };
      expect(filterEntryFields(entry, "posts", "writer")).toEqual(entry);
    });

    it("no config → pass-through", () => {
      const entry = { _id: "1", title: "Hello", body: "World" };
      expect(filterEntryFields(entry, "posts", "editor")).toEqual(entry);
    });

    it("no role → pass-through", () => {
      mockConfig = { posts: { editor: ["title"] } };
      const entry = { _id: "1", title: "Hello", body: "World" };
      expect(filterEntryFields(entry, "posts", undefined)).toEqual(entry);
    });
  });

  describe("applyFieldPermissionsToBody", () => {
    it("filters entries inside { data: [] }", () => {
      mockConfig = { posts: { editor: ["title"] } };
      const body = {
        data: [
          { _id: "1", title: "A", revenue: 100 },
          { _id: "2", title: "B", revenue: 200 },
        ],
        total: 2,
      };
      const out = applyFieldPermissionsToBody(body, "posts", "editor") as {
        data: Array<Record<string, unknown>>;
        total: number;
      };
      expect(out.total).toBe(2);
      expect(out.data[0]).toEqual({ _id: "1", title: "A" });
      expect(out.data[1]).toEqual({ _id: "2", title: "B" });
    });

    it("filters a single object inside { data: {} }", () => {
      mockConfig = { posts: { editor: ["title"] } };
      const body = { data: { _id: "1", title: "A", secret: "x" } };
      const out = applyFieldPermissionsToBody(body, "posts", "editor") as { data: unknown };
      expect(out.data).toEqual({ _id: "1", title: "A" });
    });

    it("filters a bare array", () => {
      mockConfig = { posts: { editor: ["title"] } };
      const body = [{ _id: "1", title: "A", secret: "x" }];
      const out = applyFieldPermissionsToBody(body, "posts", "editor") as Array<unknown>;
      expect(out[0]).toEqual({ _id: "1", title: "A" });
    });

    it("filters a bare object", () => {
      mockConfig = { posts: { editor: ["title"] } };
      const body = { _id: "1", title: "A", secret: "x" };
      expect(applyFieldPermissionsToBody(body, "posts", "editor")).toEqual({
        _id: "1",
        title: "A",
      });
    });

    it("admin skips filtering entirely", () => {
      mockConfig = { posts: { editor: ["title"] } };
      const body = { data: [{ _id: "1", title: "A", secret: "x" }] };
      expect(applyFieldPermissionsToBody(body, "posts", "editor", true)).toEqual(body);
    });

    it("no config → body unchanged (identity)", () => {
      const body = { data: [{ _id: "1", title: "A", secret: "x" }] };
      expect(applyFieldPermissionsToBody(body, "posts", "editor")).toEqual(body);
    });

    it("non-collection body shapes pass through", () => {
      mockConfig = { posts: { editor: ["title"] } };
      expect(applyFieldPermissionsToBody("plain-string", "posts", "editor")).toBe("plain-string");
      expect(applyFieldPermissionsToBody(null, "posts", "editor")).toBeNull();
    });

    it("handles JSON-string config", () => {
      mockConfig = JSON.stringify({ posts: { editor: ["title"] } });
      const body = { _id: "1", title: "A", secret: "x" };
      expect(applyFieldPermissionsToBody(body, "posts", "editor")).toEqual({
        _id: "1",
        title: "A",
      });
    });

    it("invalid config degrades to no filtering", () => {
      mockConfig = "not-json{{{";
      const body = { _id: "1", title: "A", secret: "x" };
      expect(applyFieldPermissionsToBody(body, "posts", "editor")).toEqual(body);
    });
  });
});
