/**
 * @file tests/unit/api/yjs-acl.test.ts
 * @description Collection-scoped ACL for Yjs collaboration channels.
 *
 * Features:
 * - docId must be `entry:{collectionId}:{entryId}`
 * - write requires collection:write (scoped or global) unless admin
 * - read requires collection:read (scoped or global) unless admin
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  parseEntryDocId,
  assertCollaborationAccess,
} from "@src/routes/api/collaboration/yjs/yjs-access";
import { invalidatePermissionCache, registerPermission } from "@src/databases/auth/permissions";
import type { Role, User } from "@src/databases/auth/types";
import { PermissionAction, PermissionType } from "@src/databases/auth/types";
import type { DatabaseId, ISODateString } from "@src/content/types";
import { AppError } from "@utils/error-handling";

const NOW = "2026-01-01T00:00:00Z" as ISODateString;

const roles: Role[] = [
  {
    _id: "admin" as DatabaseId,
    name: "Admin",
    description: "Administrator",
    permissions: [],
    isAdmin: true,
  },
  {
    _id: "editor" as DatabaseId,
    name: "Editor",
    description: "Can read and write content",
    permissions: ["collection:read", "collection:write"],
    isAdmin: false,
  },
  {
    _id: "viewer" as DatabaseId,
    name: "Viewer",
    description: "Can only view content",
    permissions: ["collection:read"],
    isAdmin: false,
  },
  {
    _id: "guest" as DatabaseId,
    name: "Guest",
    description: "No collection permissions",
    permissions: [],
    isAdmin: false,
  },
];

function user(role: string, isAdmin = false): User {
  return {
    _id: `${role}-user` as DatabaseId,
    email: `${role}@example.com`,
    role,
    isAdmin,
    permissions: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("Yjs collaboration ACL", () => {
  beforeEach(() => {
    invalidatePermissionCache();
    registerPermission({
      _id: "collection:read" as DatabaseId,
      name: "Read Content",
      action: PermissionAction.READ,
      type: PermissionType.COLLECTION,
    });
    registerPermission({
      _id: "collection:write" as DatabaseId,
      name: "Write Content",
      action: PermissionAction.WRITE,
      type: PermissionType.COLLECTION,
    });
  });

  it("parses entry:{collectionId}:{entryId}", () => {
    expect(parseEntryDocId("entry:posts:20000000-0000-7000-8000-000000000001")).toEqual({
      collectionId: "posts",
      entryId: "20000000-0000-7000-8000-000000000001",
    });
    expect(parseEntryDocId("entry:blog-posts:abc")).toEqual({
      collectionId: "blog-posts",
      entryId: "abc",
    });
  });

  it("rejects arbitrary collaboration channels", () => {
    expect(() => parseEntryDocId("posts:1")).toThrow(AppError);
    expect(() => parseEntryDocId("entry:")).toThrow(AppError);
    expect(() => parseEntryDocId("entry:only-collection")).toThrow(AppError);
    expect(() => parseEntryDocId("")).toThrow(AppError);
  });

  it("allows admin write without collection permissions", () => {
    expect(() =>
      assertCollaborationAccess(user("admin", true), roles, "write", "posts"),
    ).not.toThrow();
  });

  it("allows editor write via global collection:write", () => {
    expect(() => assertCollaborationAccess(user("editor"), roles, "write", "posts")).not.toThrow();
  });

  it("allows viewer read but rejects write", () => {
    expect(() => assertCollaborationAccess(user("viewer"), roles, "read", "posts")).not.toThrow();
    expect(() => assertCollaborationAccess(user("viewer"), roles, "write", "posts")).toThrow(
      AppError,
    );
  });

  it("rejects guest read and write", () => {
    expect(() => assertCollaborationAccess(user("guest"), roles, "read", "posts")).toThrow(
      AppError,
    );
    expect(() => assertCollaborationAccess(user("guest"), roles, "write", "posts")).toThrow(
      AppError,
    );
  });
});
