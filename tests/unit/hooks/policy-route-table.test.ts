/**
 * @file tests/unit/hooks/policy-route-table.test.ts
 * @description Unit tests for the unified bitmask policy engine and O(1) route table.
 */

import { describe, it, expect } from "vitest";
import { Policy, hasPolicy, hasAnyPolicy, formatPolicy } from "@src/hooks/policy";
import { resolveRoutePolicy } from "@src/hooks/route-table";
import {
  clearTurboAuthCache,
  getSecurityStamp,
  getTurboAuthContext,
  invalidateTurboAuthForUser,
  setTurboAuthContext,
} from "@src/hooks/handle-turbo-get";

describe("Policy bitmask", () => {
  it("evaluates hasPolicy and hasAnyPolicy accurately", () => {
    const mask = Policy.AUTH_COOKIE | Policy.CSRF | Policy.WRITE_LIMIT;
    expect(hasPolicy(mask, Policy.AUTH_COOKIE)).toBe(true);
    expect(hasPolicy(mask, Policy.AUTH_COOKIE | Policy.CSRF)).toBe(true);
    expect(hasPolicy(mask, Policy.AUTH_COOKIE | Policy.READ_LIMIT)).toBe(false);
    expect(hasAnyPolicy(mask, Policy.READ_LIMIT | Policy.WRITE_LIMIT)).toBe(true);
    expect(hasAnyPolicy(mask, Policy.STRIP_COOKIES | Policy.AUDIT_SYNC)).toBe(false);
    expect(formatPolicy(mask)).toEqual(["AUTH_COOKIE", "CSRF", "WRITE_LIMIT"]);
  });
});

describe("Route table policy resolution", () => {
  it("resolves public health routes with STRIP_COOKIES", () => {
    const { policy, routeId } = resolveRoutePolicy("/api/health", "GET");
    expect(routeId).toBe("api:health");
    expect(hasPolicy(policy, Policy.STRIP_COOKIES | Policy.READ_LIMIT)).toBe(true);
    expect(hasPolicy(policy, Policy.AUTH_COOKIE)).toBe(false);
  });

  it("resolves collection read vs write policies", () => {
    const read = resolveRoutePolicy("/api/collections/posts", "GET");
    expect(read.routeId).toBe("api:collections");
    expect(
      hasPolicy(read.policy, Policy.AUTH_COOKIE | Policy.READ_LIMIT | Policy.TENANT_SCOPE),
    ).toBe(true);
    expect(hasPolicy(read.policy, Policy.CSRF)).toBe(false);

    const write = resolveRoutePolicy("/api/collections/posts", "POST");
    expect(write.routeId).toBe("api:collections");
    expect(
      hasPolicy(
        write.policy,
        Policy.AUTH_COOKIE | Policy.CSRF | Policy.WRITE_LIMIT | Policy.AUDIT_ASYNC,
      ),
    ).toBe(true);
  });

  it("resolves system mutations with AUDIT_SYNC", () => {
    const sys = resolveRoutePolicy("/api/system/settings", "PUT");
    expect(sys.routeId).toBe("api:system");
    expect(hasPolicy(sys.policy, Policy.AUDIT_SYNC | Policy.CSRF)).toBe(true);
  });
});

describe("Turbo auth securityStamp revocation", () => {
  it("bumps securityStamp and evicts cached sessions on invalidateTurboAuthForUser", () => {
    clearTurboAuthCache();
    const userId = "user-stamp-test";
    const before = getSecurityStamp(userId);
    setTurboAuthContext(
      "sess-stamp-1",
      { _id: userId, email: "u@example.com", role: "editor" } as never,
      [],
      null,
    );
    expect(getTurboAuthContext("sess-stamp-1")).not.toBeNull();

    invalidateTurboAuthForUser(userId);
    expect(getSecurityStamp(userId)).toBe(before + 1);
    expect(getTurboAuthContext("sess-stamp-1")).toBeNull();
  });
});
