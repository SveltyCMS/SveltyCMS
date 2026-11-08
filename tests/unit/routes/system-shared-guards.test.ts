/**
 * @file tests/unit/routes/system-shared-guards.test.ts
 * @description Pins the shared system-handler guards: 401-before-403 admin
 * checks and the super-admin-only `?tenantId=` override.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

const { isMultiTenantEnabled } = vi.hoisted(() => ({
  isMultiTenantEnabled: vi.fn(() => true),
}));

vi.mock("@utils/tenant-isolation.server", () => ({
  isMultiTenantEnabled,
}));

import {
  requireAdminUser,
  requireAuthenticatedUser,
  requireTenant,
  resolveRequestTenant,
} from "../../../src/routes/api/[...path]/handlers/system/system-shared";

function eventFor(url: string, user: Record<string, unknown> | null): RequestEvent {
  return { url: new URL(url), locals: { user, isAdmin: false } } as unknown as RequestEvent;
}

describe("system-shared guards", () => {
  beforeEach(() => {
    isMultiTenantEnabled.mockReturnValue(true);
  });

  it("rejects a missing session with 401", () => {
    expect(() => requireAuthenticatedUser(eventFor("http://x/api/system", null))).toThrow(
      expect.objectContaining({ status: 401 }),
    );
  });

  it("rejects a non-admin session with 403", () => {
    expect(() => requireAdminUser(eventFor("http://x/api/system", { role: "editor" }))).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });

  it("returns the admin user", () => {
    const user = { role: "admin", _id: "u1" };
    expect(requireAdminUser(eventFor("http://x/api/system", user))).toBe(user);
  });

  it("requires a tenant only when multi-tenancy is enabled", () => {
    expect(() => requireTenant("")).toThrow(expect.objectContaining({ status: 400 }));
    isMultiTenantEnabled.mockReturnValue(false);
    expect(requireTenant("")).toBe("");
  });

  it("lets a super-admin override the tenant", () => {
    expect(
      resolveRequestTenant(
        eventFor("http://x/api/automations?tenantId=t2", { role: "super-admin" }),
        "t1",
        {
          role: "super-admin",
        },
      ),
    ).toBe("t2");
  });

  it("blocks a tenant override for other admins", () => {
    expect(() =>
      resolveRequestTenant(
        eventFor("http://x/api/automations?tenantId=t2", { role: "admin" }),
        "t1",
        {
          role: "admin",
        },
      ),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
});
