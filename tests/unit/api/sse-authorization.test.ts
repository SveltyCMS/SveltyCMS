/**
 * @file tests/unit/api/sse-authorization.test.ts
 * @description Access predicate for the generic SSE stream.
 *
 * Regression: `handleContentEventsStream` filtered the wildcard EventBus only by
 * `tenantId`, so any authenticated `api:events` subscriber in a tenant received
 * every `yjs:sync` / `yjs:awareness` frame, i.e. the document bytes of every
 * collaborative entry. Collection events (`form:submit`, `workflow:transitioned`,
 * …) leaked their payload the same way. Each event must now be authorized against
 * the subscriber before it is forwarded.
 *
 * ### Features:
 * - Yjs doc channels require `entry:{collection}:{entryId}` + collection read
 * - collection events require read on the emitted collection (global for `*`)
 * - tenant mismatch, unknown shapes and anonymous subscribers fail closed
 * - per-connection cache: a cached subject is resolved with one Map lookup
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  createSseAuthorizer,
  isSseEventAllowed,
  sseAccessCacheKey,
} from "@api/[...path]/handlers/sse-authorization";
import { hasCollaborationAccess } from "@src/services/collaboration/access";
import { invalidatePermissionCache, registerPermission } from "@src/databases/auth/permissions";
import type { Permission, Role, User } from "@src/databases/auth/types";
import { PermissionAction, PermissionType } from "@src/databases/auth/types";
import type { DatabaseId, ISODateString } from "@src/content/types";

const NOW = "2026-01-01T00:00:00Z" as ISODateString;
const TENANT = "tenant-a";

const roles: Role[] = [
  {
    _id: "admin" as DatabaseId,
    name: "Admin",
    description: "Administrator",
    permissions: [],
    isAdmin: true,
  },
  {
    _id: "viewer" as DatabaseId,
    name: "Viewer",
    description: "Can read every collection",
    permissions: ["collection:read"],
    isAdmin: false,
  },
  {
    _id: "reporter" as DatabaseId,
    name: "Reporter",
    description: "Can read posts only",
    permissions: ["collection:read:posts"],
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

function yjsPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    docId: "entry:posts:entry-1",
    updateBase64: "AAAA",
    origin: "server",
    tenantId: TENANT,
    ...overrides,
  };
}

describe("SSE event authorization", () => {
  beforeEach(() => {
    invalidatePermissionCache();
    const permissions: Permission[] = [
      {
        _id: "collection:read" as DatabaseId,
        name: "Read Content",
        action: PermissionAction.READ,
        type: PermissionType.COLLECTION,
      },
      {
        _id: "collection:read:posts" as DatabaseId,
        name: "Read Posts",
        action: PermissionAction.READ,
        type: PermissionType.COLLECTION,
        contextId: "posts",
      },
    ];
    for (const permission of permissions) registerPermission(permission);
  });

  describe("Yjs document channels", () => {
    it("allows an admin subscriber in the same tenant", () => {
      expect(
        isSseEventAllowed({
          event: "yjs:sync",
          payload: yjsPayload(),
          user: user("admin", true),
          tenantId: TENANT,
        }),
      ).toBe(true);
    });

    it("allows a subscriber with the global collection:read grant", () => {
      expect(
        isSseEventAllowed({
          event: "yjs:awareness",
          payload: yjsPayload(),
          user: user("viewer"),
          roles,
          tenantId: TENANT,
        }),
      ).toBe(true);
    });

    it("allows a collection-scoped read grant only for that collection", () => {
      const reporter = user("reporter");

      expect(
        isSseEventAllowed({
          event: "yjs:sync",
          payload: yjsPayload(),
          user: reporter,
          roles,
          tenantId: TENANT,
        }),
      ).toBe(true);
      expect(
        isSseEventAllowed({
          event: "yjs:sync",
          payload: yjsPayload({ docId: "entry:secrets:entry-1" }),
          user: reporter,
          roles,
          tenantId: TENANT,
        }),
      ).toBe(false);
    });

    it("denies a subscriber without any collection grant", () => {
      expect(
        isSseEventAllowed({
          event: "yjs:sync",
          payload: yjsPayload(),
          user: user("guest"),
          roles,
          tenantId: TENANT,
        }),
      ).toBe(false);
    });

    it("denies a tenant mismatch even for an admin", () => {
      expect(
        isSseEventAllowed({
          event: "yjs:sync",
          payload: yjsPayload({ tenantId: "tenant-b" }),
          user: user("admin", true),
          tenantId: TENANT,
        }),
      ).toBe(false);
      // A Yjs document may not use the broadcast wildcard.
      expect(
        isSseEventAllowed({
          event: "yjs:sync",
          payload: yjsPayload({ tenantId: "all" }),
          user: user("admin", true),
          tenantId: TENANT,
        }),
      ).toBe(false);
    });

    it("denies a malformed docId, a missing update payload and anonymous callers", () => {
      const admin = user("admin", true);

      expect(
        isSseEventAllowed({
          event: "yjs:sync",
          payload: yjsPayload({ docId: "posts:1" }),
          user: admin,
          tenantId: TENANT,
        }),
      ).toBe(false);
      expect(
        isSseEventAllowed({
          event: "yjs:sync",
          payload: yjsPayload({ docId: undefined }),
          user: admin,
          tenantId: TENANT,
        }),
      ).toBe(false);
      expect(
        isSseEventAllowed({
          event: "yjs:sync",
          payload: yjsPayload({ updateBase64: undefined }),
          user: admin,
          tenantId: TENANT,
        }),
      ).toBe(false);
      expect(
        isSseEventAllowed({
          event: "yjs:sync",
          payload: yjsPayload(),
          user: null,
          tenantId: TENANT,
        }),
      ).toBe(false);
    });
  });

  describe("collection events", () => {
    it("allows a collection event the subscriber may read", () => {
      expect(
        isSseEventAllowed({
          event: "form:submit",
          payload: { collection: "posts", tenantId: TENANT },
          user: user("reporter"),
          roles,
          tenantId: TENANT,
        }),
      ).toBe(true);
    });

    it("denies a collection the subscriber may not read", () => {
      expect(
        isSseEventAllowed({
          event: "form:submit",
          payload: { collection: "secrets", tenantId: TENANT },
          user: user("reporter"),
          roles,
          tenantId: TENANT,
        }),
      ).toBe(false);
    });

    it("requires the global grant for the tenant-wide collection wildcard", () => {
      expect(
        isSseEventAllowed({
          event: "content:update",
          payload: { collection: "*", tenantId: TENANT },
          user: user("viewer"),
          roles,
          tenantId: TENANT,
        }),
      ).toBe(true);
      expect(
        isSseEventAllowed({
          event: "content:update",
          payload: { collection: "*", tenantId: TENANT },
          user: user("reporter"),
          roles,
          tenantId: TENANT,
        }),
      ).toBe(false);
    });

    it("denies a collection event from another tenant", () => {
      expect(
        isSseEventAllowed({
          event: "content:update",
          payload: { collection: "*", tenantId: "tenant-b" },
          user: user("viewer"),
          roles,
          tenantId: TENANT,
        }),
      ).toBe(false);
    });

    it("denies missing or empty collection ids", () => {
      for (const collection of [undefined, "", null]) {
        expect(
          isSseEventAllowed({
            event: "form:submit",
            payload: { collection, tenantId: TENANT },
            user: user("admin", true),
            tenantId: TENANT,
          }),
        ).toBe(false);
      }
    });
  });

  describe("unknown event shapes", () => {
    it("drops non-Yjs events without a collection subject", () => {
      expect(
        isSseEventAllowed({
          event: "chat:message",
          payload: { user: "alice", data: { text: "secret" }, tenantId: TENANT },
          user: user("admin", true),
          tenantId: TENANT,
        }),
      ).toBe(false);
    });

    it("drops an event with no name", () => {
      expect(
        isSseEventAllowed({
          event: undefined,
          payload: { collection: "posts", tenantId: TENANT },
          user: user("admin", true),
          tenantId: TENANT,
        }),
      ).toBe(false);
    });
  });

  describe("per-connection decision cache", () => {
    it("resolves a cached subject without re-evaluating it", async () => {
      const authorizer = createSseAuthorizer({
        user: user("viewer"),
        roles,
        tenantId: TENANT,
      });
      const payload = yjsPayload();

      expect(authorizer.peek("yjs:sync", payload)).toBeUndefined();
      await expect(authorizer.authorize("yjs:sync", payload)).resolves.toBe(true);
      expect(authorizer.peek("yjs:sync", payload)).toBe(true);

      const collectionPayload = { collection: "posts", tenantId: TENANT };
      expect(authorizer.peek("form:submit", collectionPayload)).toBeUndefined();
      await expect(authorizer.authorize("form:submit", collectionPayload)).resolves.toBe(true);
      expect(authorizer.peek("form:submit", collectionPayload)).toBe(true);
    });

    it("caches denials per document so the subscriber is never forwarded", async () => {
      const authorizer = createSseAuthorizer({
        user: user("guest"),
        roles,
        tenantId: TENANT,
      });
      const payload = yjsPayload();

      await expect(authorizer.authorize("yjs:sync", payload)).resolves.toBe(false);
      expect(authorizer.peek("yjs:sync", payload)).toBe(false);
    });

    it("builds stable keys per doc and per collection, none for unknown shapes", () => {
      expect(sseAccessCacheKey("yjs:sync", yjsPayload())).toBe("yjs:entry:posts:entry-1");
      expect(sseAccessCacheKey("form:submit", { collection: "posts" })).toBe("collection:posts");
      expect(sseAccessCacheKey("chat:message", { tenantId: TENANT })).toBeUndefined();
    });
  });
});

describe("hasCollaborationAccess", () => {
  beforeEach(() => {
    invalidatePermissionCache();
    registerPermission({
      _id: "collection:read" as DatabaseId,
      name: "Read Content",
      action: PermissionAction.READ,
      type: PermissionType.COLLECTION,
    });
  });

  it("matches the write endpoint rule: scoped or global, admin bypass", () => {
    expect(hasCollaborationAccess(user("admin", true), roles, "write", "posts")).toBe(true);
    expect(hasCollaborationAccess(user("viewer"), roles, "read", "posts")).toBe(true);
    expect(hasCollaborationAccess(user("viewer"), roles, "write", "posts")).toBe(false);
    expect(hasCollaborationAccess(user("guest"), roles, "read", "posts")).toBe(false);
    expect(hasCollaborationAccess(null, roles, "read", "posts")).toBe(false);
  });
});
