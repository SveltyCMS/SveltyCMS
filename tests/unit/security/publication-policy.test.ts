/**
 * @file tests/unit/security/publication-policy.test.ts
 * @description Unit tests for publication visibility policy.
 *
 * Ensures unprivileged callers cannot observe draft/unpublished content across
 * REST, GraphQL, or SDK queries even if requesting publicationFilter=all or draft.
 */

import { describe, it, expect } from "vitest";
import {
  applyPublicationToQuery,
  publicationCacheSuffix,
  resolvePublicationFilter,
} from "../../../src/utils/security/publication-policy";

describe("publication-policy — draft isolation & privilege gating", () => {
  it("forces unprivileged anonymous users to published", () => {
    expect(resolvePublicationFilter({}, "all")).toBe("published");
    expect(resolvePublicationFilter({}, "draft")).toBe("published");
    expect(resolvePublicationFilter({}, "published")).toBe("published");
    expect(resolvePublicationFilter({}, undefined)).toBe("published");
  });

  it("forces authenticated non-admin / non-editor users to published", () => {
    const regularUser = { _id: "u1", role: "user", email: "user@example.com" };
    expect(resolvePublicationFilter({ user: regularUser }, "all")).toBe("published");
    expect(resolvePublicationFilter({ user: regularUser }, "draft")).toBe("published");
    expect(resolvePublicationFilter({ user: regularUser }, "published")).toBe("published");
    expect(resolvePublicationFilter({ user: regularUser }, undefined)).toBe("published");

    const viewerUser = { _id: "u2", role: "viewer", email: "viewer@example.com" };
    expect(resolvePublicationFilter({ user: viewerUser }, "all")).toBe("published");
    expect(resolvePublicationFilter({ user: viewerUser }, "draft")).toBe("published");
  });

  it("allows admin users to choose any publication filter and defaults to all", () => {
    const adminRoleUser = { _id: "admin1", role: "admin" };
    expect(resolvePublicationFilter({ user: adminRoleUser }, "all")).toBe("all");
    expect(resolvePublicationFilter({ user: adminRoleUser }, "draft")).toBe("draft");
    expect(resolvePublicationFilter({ user: adminRoleUser }, "published")).toBe("published");
    expect(resolvePublicationFilter({ user: adminRoleUser }, undefined)).toBe("all");

    const adminFlagUser = { _id: "admin2", isAdmin: true };
    expect(resolvePublicationFilter({ user: adminFlagUser }, "all")).toBe("all");
    expect(resolvePublicationFilter({ user: adminFlagUser }, "draft")).toBe("draft");
    expect(resolvePublicationFilter({ user: adminFlagUser }, undefined)).toBe("all");
  });

  it("forces editor role without draft permissions to published", () => {
    const unprivilegedEditor = { _id: "editor1", role: "editor" };
    expect(resolvePublicationFilter({ user: unprivilegedEditor }, "all")).toBe("published");
    expect(resolvePublicationFilter({ user: unprivilegedEditor }, "draft")).toBe("published");
    expect(resolvePublicationFilter({ user: unprivilegedEditor }, "published")).toBe("published");
    expect(resolvePublicationFilter({ user: unprivilegedEditor }, undefined)).toBe("published");
  });

  it("allows users with draft read permissions to choose any publication filter", () => {
    const privilegedEditor = {
      _id: "editor2",
      role: "editor",
      permissions: ["content:read_drafts"],
    };
    expect(resolvePublicationFilter({ user: privilegedEditor }, "all")).toBe("all");
    expect(resolvePublicationFilter({ user: privilegedEditor }, "draft")).toBe("draft");
    expect(resolvePublicationFilter({ user: privilegedEditor }, "published")).toBe("published");
    expect(resolvePublicationFilter({ user: privilegedEditor }, undefined)).toBe("all");
  });

  it("allows system caller to choose any publication filter and defaults to all", () => {
    expect(resolvePublicationFilter({ system: true }, "all")).toBe("all");
    expect(resolvePublicationFilter({ system: true }, "draft")).toBe("draft");
    expect(resolvePublicationFilter({ system: true }, "published")).toBe("published");
    expect(resolvePublicationFilter({ system: true }, undefined)).toBe("all");
  });
});

describe("applyPublicationToQuery — adapter-level status binding", () => {
  it("binds status=publish for the published filter", () => {
    const query = applyPublicationToQuery({ _id: "1" }, "published");
    expect(query).toEqual({ _id: "1", status: "publish" });
  });

  it("binds draft/unpublish $in for the draft filter", () => {
    const query = applyPublicationToQuery({ _id: "1" }, "draft");
    expect(query).toEqual({ _id: "1", status: { $in: ["draft", "unpublish"] } });
  });

  it("leaves the query unchanged for all", () => {
    const query = applyPublicationToQuery({ _id: "1", tenantId: "t1" }, "all");
    expect(query).toEqual({ _id: "1", tenantId: "t1" });
  });
});

describe("publicationCacheSuffix — privileged keys stay unfragmented", () => {
  it("omits a suffix for the unconstrained all filter (matches pre-policy keys)", () => {
    expect(publicationCacheSuffix("all")).toBe("");
  });

  it("keeps published/draft distinct so an all-cached row cannot leak to clamped callers", () => {
    expect(publicationCacheSuffix("published")).toBe(":published");
    expect(publicationCacheSuffix("draft")).toBe(":draft");
  });
});
