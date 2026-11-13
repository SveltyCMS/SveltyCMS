/**
 * @file tests/unit/utils/user-role-defaults.test.ts
 * @description Least-privilege invite default (SV-085).
 *
 * A new invitation must never pre-select Administrator: an operator who invites
 * a colleague should not hand out the most privileged account by accident. The
 * edit path passes the stored role explicitly, so only the create path uses this.
 */

import { describe, expect, it } from "vitest";
import { isAdminRole, resolveDefaultInviteRole, type RoleOption } from "@utils/user-role-defaults";

const role = (id: string, name = id): RoleOption => ({ _id: id, name });

describe("resolveDefaultInviteRole", () => {
  it("prefers the editor role over every other non-admin role", () => {
    expect(
      resolveDefaultInviteRole([role("admin", "Administrator"), role("viewer"), role("editor")]),
    ).toBe("editor");
  });

  it("falls back in the documented order when editor is absent", () => {
    expect(
      resolveDefaultInviteRole([role("admin", "Administrator"), role("viewer"), role("user")]),
    ).toBe("user");
    expect(resolveDefaultInviteRole([role("admin", "Administrator"), role("viewer")])).toBe(
      "viewer",
    );
  });

  it("never selects an administrator when another role exists", () => {
    expect(
      resolveDefaultInviteRole([role("admin", "Administrator"), role("custom-role", "Custom")]),
    ).toBe("custom-role");
  });

  it("falls back to admin only when it is the sole role", () => {
    expect(resolveDefaultInviteRole([role("admin", "Administrator")])).toBe("admin");
  });

  it("returns admin for an empty role list instead of throwing", () => {
    expect(resolveDefaultInviteRole([])).toBe("admin");
  });

  it("recognises administrator by id or display name", () => {
    expect(isAdminRole(role("admin", "Editor"))).toBe(true);
    expect(isAdminRole(role("custom", "Administrator"))).toBe(true);
    expect(isAdminRole(role("editor", "Editor"))).toBe(false);
  });
});
