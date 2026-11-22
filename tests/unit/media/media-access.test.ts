/**
 * @file tests/unit/media/media-access.test.ts
 * @description Decision table for private-media enforcement on `/files/**`.
 *
 * The route used to authorize on the tenant path prefix alone, so a stored
 * `access: "private"` was advisory. `decideMediaAccess()` is the pure decision the
 * route applies when `MEDIA_ENFORCE_PRIVATE_ACCESS` is enabled; this file pins every
 * branch, including the "legacy unmarked row" and "global tenant is not a master key"
 * cases that the earlier design got wrong.
 */

import { describe, expect, it } from "vitest";
import { decideMediaAccess } from "../../../src/utils/media/media-access";

const base = { pathTenant: "tenant-a", authenticated: true, callerTenantId: "tenant-a" } as const;

describe("decideMediaAccess", () => {
  it("serves public media to anyone", () => {
    expect(
      decideMediaAccess({ ...base, access: "public", authenticated: false, callerTenantId: null }),
    ).toEqual({ allowed: true, reason: "public" });
  });

  it("treats a missing/legacy access value as public", () => {
    expect(decideMediaAccess({ ...base, access: undefined })).toEqual({
      allowed: true,
      reason: "legacy-unmarked",
    });
  });

  it("restricts both private and protected", () => {
    expect(decideMediaAccess({ ...base, access: "protected" })).toEqual({
      allowed: true,
      reason: "owner-tenant",
    });
    expect(decideMediaAccess({ ...base, access: "protected", authenticated: false })).toMatchObject(
      { allowed: false },
    );
  });

  it("requires authentication for private media", () => {
    expect(
      decideMediaAccess({ ...base, access: "private", authenticated: false, callerTenantId: null }),
    ).toEqual({ allowed: false, reason: "auth-required" });
  });

  it("allows an authenticated caller in the owning tenant", () => {
    expect(decideMediaAccess({ ...base, access: "private" })).toEqual({
      allowed: true,
      reason: "owner-tenant",
    });
  });

  it("denies a caller from another tenant", () => {
    expect(decideMediaAccess({ ...base, access: "private", callerTenantId: "tenant-b" })).toEqual({
      allowed: false,
      reason: "tenant-mismatch",
    });
  });

  it("denies a non-admin whose tenant is 'global'", () => {
    expect(
      decideMediaAccess({ ...base, access: "private", callerTenantId: "global", isAdmin: false }),
    ).toEqual({ allowed: false, reason: "tenant-mismatch" });
  });

  it("allows a system admin regardless of tenant", () => {
    expect(
      decideMediaAccess({
        ...base,
        access: "private",
        callerTenantId: "tenant-b",
        isAdmin: true,
      }),
    ).toEqual({ allowed: true, reason: "admin" });
  });

  it("denies an authenticated caller with no tenant context", () => {
    expect(decideMediaAccess({ ...base, access: "private", callerTenantId: null })).toEqual({
      allowed: false,
      reason: "tenant-mismatch",
    });
  });

  it("lets a valid signed URL win even for an anonymous private request", () => {
    expect(
      decideMediaAccess({
        access: "private",
        authenticated: false,
        callerTenantId: null,
        pathTenant: "tenant-a",
        signedUrlValid: true,
      }),
    ).toEqual({ allowed: true, reason: "signed-url" });
  });
});
