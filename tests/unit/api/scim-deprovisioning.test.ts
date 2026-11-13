/**
 * @file tests/unit/api/scim-deprovisioning.test.ts
 * @description An IdP deprovision must actually cut access, not only annotate the record.
 *
 * WHY: SCIM wrote `active` into `isActive`, but the authentication pipeline enforces
 * `blocked` (handle-authentication.ts checks `user.blocked` at session revalidation and
 * at DB re-validation). A `PATCH active:false` from Okta/Entra therefore left the account
 * fully usable — the standard deprovisioning flow was a no-op.
 */
import { describe, it, expect } from "vitest";
import { applyScimPatchOps, buildScimUser } from "@src/utils/scim-utils";

const base = "http://localhost";

describe("SCIM deprovisioning moves the enforced field", () => {
  it("PATCH replace active:false also blocks", () => {
    const u = applyScimPatchOps({}, [{ op: "replace", path: "active", value: false }]);
    expect(u.isActive).toBe(false);
    expect(u.blocked).toBe(true);
  });

  it("PATCH replace active:true unblocks", () => {
    const u = applyScimPatchOps({}, [{ op: "replace", path: "active", value: true }]);
    expect(u.isActive).toBe(true);
    expect(u.blocked).toBe(false);
  });

  it("path-less merge (PUT body) blocks as well", () => {
    const u = applyScimPatchOps({}, [{ op: "replace", value: { active: false } }]);
    expect(u.isActive).toBe(false);
    expect(u.blocked).toBe(true);
  });

  it("removing active restores the RFC default and unblocks", () => {
    const u = applyScimPatchOps({}, [{ op: "remove", path: "active" }]);
    expect(u.isActive).toBe(true);
    expect(u.blocked).toBe(false);
  });

  it("GET reports a blocked account as inactive", () => {
    expect(
      buildScimUser({ _id: "1", email: "a@b.c", isActive: true, blocked: true }, base).active,
    ).toBe(false);
    expect(buildScimUser({ _id: "1", email: "a@b.c", isActive: false }, base).active).toBe(false);
    expect(
      buildScimUser({ _id: "1", email: "a@b.c", isActive: true, blocked: false }, base).active,
    ).toBe(true);
  });
});
