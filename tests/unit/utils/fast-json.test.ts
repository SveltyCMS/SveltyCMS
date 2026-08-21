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
});
