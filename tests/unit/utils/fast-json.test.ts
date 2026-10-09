/**
 * @file tests/unit/utils/fast-json.test.ts
 * @description
 * Unit tests for Fast JSON serializers and flat query shape serializer.
 *
 * Verifies that fast serializers generate 100% valid JSON matching JSON.parse() schemas,
 * properly escape special characters, and produce stable query hash keys.
 */

import { describe, it, expect } from "vitest";
import {
  fastEscapeString,
  serializeUserSafe,
  serializeRoleSafe,
  serializeMediaItemSafe,
  serializeContentNodeSafe,
  serializeArrayFast,
  serializeQueryShape,
  serializeSuccessEnvelope,
  serializeListEnvelope,
  serializeErrorEnvelope,
  serializeItemsEnvelopeSafe,
  serializeRowFast,
  STATIC_ENVELOPES,
} from "@src/utils/fast-json";

describe("Fast JSON Serializers", () => {
  it("escapes special characters correctly", () => {
    expect(fastEscapeString("hello world")).toBe("hello world");
    expect(fastEscapeString('hello "world"')).toBe('hello \\"world\\"');
    expect(fastEscapeString("line1\nline2")).toBe("line1\\nline2");
  });

  it("serializes user snapshots to valid JSON", () => {
    const user = {
      _id: "user-123",
      email: "jane.doe@example.com",
      username: "janedoe",
      role: "admin",
      firstName: "Jane",
      lastName: "Doe",
      avatar: "https://example.com/avatar.jpg",
      tenantId: "tenant-a",
      isAdmin: true,
      emailVerified: true,
      blocked: false,
      roleIds: ["admin", "editor"],
    };

    const jsonStr = serializeUserSafe(user);
    const parsed = JSON.parse(jsonStr);

    expect(parsed._id).toBe("user-123");
    expect(parsed.email).toBe("jane.doe@example.com");
    expect(parsed.role).toBe("admin");
    expect(parsed.isAdmin).toBe(true);
    expect(parsed.roleIds).toEqual(["admin", "editor"]);
  });

  it("serializes roles to valid JSON", () => {
    const role = {
      _id: "role-admin",
      name: "Administrator",
      description: "Full system control",
      icon: "mdi:shield",
      color: "#ff0000",
      tenantId: "tenant-a",
      isAdmin: true,
      permissions: ["user:read", "user:write"],
    };

    const jsonStr = serializeRoleSafe(role);
    const parsed = JSON.parse(jsonStr);

    expect(parsed._id).toBe("role-admin");
    expect(parsed.name).toBe("Administrator");
    expect(parsed.isAdmin).toBe(true);
    expect(parsed.permissions).toEqual(["user:read", "user:write"]);
  });

  it("serializes media items to valid JSON", () => {
    const media = {
      _id: "media-456",
      filename: "photo.jpg",
      originalFilename: "my photo.jpg",
      mimeType: "image/jpeg",
      path: "/uploads/photo.jpg",
      size: 102400,
      folderId: "folder-1",
      tenantId: "tenant-a",
      createdAt: "2026-08-21T10:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    };

    const jsonStr = serializeMediaItemSafe(media);
    const parsed = JSON.parse(jsonStr);

    expect(parsed._id).toBe("media-456");
    expect(parsed.filename).toBe("photo.jpg");
    expect(parsed.size).toBe(102400);
    expect(parsed.folderId).toBe("folder-1");
  });

  it("serializes content nodes to valid JSON", () => {
    const node = {
      _id: "node-789",
      name: "Articles",
      slug: "articles",
      nodeType: "collection",
      status: "published",
      parentId: null,
      order: 1,
      tenantId: "default",
    };

    const jsonStr = serializeContentNodeSafe(node);
    const parsed = JSON.parse(jsonStr);

    expect(parsed._id).toBe("node-789");
    expect(parsed.name).toBe("Articles");
    expect(parsed.nodeType).toBe("collection");
    expect(parsed.parentId).toBeNull();
  });

  it("serializes arrays of items fast without intermediate array allocation", () => {
    const users = [
      { _id: "u1", email: "u1@test.com", username: "u1", role: "user" },
      { _id: "u2", email: "u2@test.com", username: "u2", role: "admin" },
    ];

    const jsonStr = serializeArrayFast(users, serializeUserSafe);
    const parsed = JSON.parse(jsonStr);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0]._id).toBe("u1");
    expect(parsed[1]._id).toBe("u2");
  });

  it("builds deterministic flat query shapes for O(1) cache keys", () => {
    const q1 = { status: "published", category: "tech" };
    const shape1 = serializeQueryShape(q1, 50, 0, { updatedAt: -1 }, null, null);

    const q2 = { status: "published", category: "tech" };
    const shape2 = serializeQueryShape(q2, 50, 0, { updatedAt: -1 }, null, null);

    expect(shape1).toBe(shape2);
    expect(shape1).toContain("status=published;");
    expect(shape1).toContain("category=tech;");
    expect(shape1).toContain("l:50|o:0");
  });

  it("serializes success, list, and error envelopes with zero reflection", () => {
    const successEnv = serializeSuccessEnvelope('{"key":"value"}');
    expect(JSON.parse(successEnv)).toEqual({ success: true, data: { key: "value" } });

    const listEnv = serializeListEnvelope('[{"id":1},{"id":2}]', { total: 42, page: 1, limit: 10 });
    expect(JSON.parse(listEnv)).toEqual({
      success: true,
      data: [{ id: 1 }, { id: 2 }],
      total: 42,
      page: 1,
      limit: 10,
    });

    const errorEnv = serializeErrorEnvelope("Item not found", "NOT_FOUND", 404);
    expect(JSON.parse(errorEnv)).toEqual({
      success: false,
      message: "Item not found",
      code: "NOT_FOUND",
      status: 404,
    });

    const staticUnauthorized = JSON.parse(STATIC_ENVELOPES.UNAUTHORIZED);
    expect(staticUnauthorized.success).toBe(false);
    expect(staticUnauthorized.code).toBe("UNAUTHORIZED");
  });

  it("serializes items directly into an envelope via serializeItemsEnvelopeSafe", () => {
    const users = [{ _id: "u1", email: "u1@test.com", username: "u1", role: "user" }];
    const envelopeStr = serializeItemsEnvelopeSafe(users, serializeUserSafe, { total: 1 });
    const parsed = JSON.parse(envelopeStr);
    expect(parsed.success).toBe(true);
    expect(parsed.total).toBe(1);
    expect(parsed.data[0]._id).toBe("u1");
  });

  it("serializeRowFast is byte-identical to JSON.stringify for content-row shapes", () => {
    const rows: unknown[] = [
      {},
      { _id: "a", title: "Hello world" },
      {
        title: 'quote " inside \\ and \n newline',
        views: 42,
        pi: 3.14,
        neg: -0,
        big: 1e21,
        small: 1e-7,
        ok: true,
        no: false,
        missing: null,
        unicode: "日本語 🚀 ünïcödé",
        nested: { a: [1, 2, { b: "c" }], d: null },
        arr: ["x", null, 3, true],
        when: new Date("2026-10-09T12:00:00.000Z"),
      },
      { status: "publish", count: 0, ratio: 0.5 },
    ];
    for (const row of rows) {
      expect(serializeRowFast(row)).toBe(JSON.stringify(row));
    }
    // Array-in-envelope path matches too.
    expect(serializeArrayFast(rows, serializeRowFast)).toBe(JSON.stringify(rows));
  });

  it("serializeRowFast preserves JSON.stringify edge semantics", () => {
    // undefined-valued keys are dropped; NaN/Infinity become null.
    expect(serializeRowFast({ a: undefined, b: NaN, c: Infinity, d: 1 })).toBe(
      JSON.stringify({ a: undefined, b: NaN, c: Infinity, d: 1 }),
    );
    // Integer-like keys reorder per spec → fallback keeps byte-identity.
    expect(serializeRowFast({ "2": "b", "1": "a", x: 1 })).toBe(
      JSON.stringify({ "2": "b", "1": "a", x: 1 }),
    );
    // Lone surrogates escape exactly like JSON.stringify.
    expect(serializeRowFast({ t: "\uD800" })).toBe(JSON.stringify({ t: "\uD800" }));
    // Non-object rows fall back to JSON.stringify.
    expect(serializeRowFast(null)).toBe("null");
    expect(serializeRowFast([1, "a"])).toBe(JSON.stringify([1, "a"]));
    expect(serializeRowFast(7)).toBe("7");
  });
});
