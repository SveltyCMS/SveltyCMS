/**
 * @file tests/unit/security/system-tenant-scope.test.ts
 * @description Branded SystemTenantScope — forge resistance + hasTenantBypass.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@src/databases/config-state", () => ({
  getPrivateEnv: () => (globalThis as any).__privateEnv,
  setPrivateEnv: (env: any) => {
    (globalThis as any).__privateEnv = env;
  },
  loadPrivateConfig: () => Promise.resolve((globalThis as any).__privateEnv),
  clearPrivateConfigCache: () => {},
}));

import {
  createSystemTenantScope,
  hasTenantBypass,
  isSystemTenantScope,
  withSystemScope,
} from "@src/databases/system-tenant-scope";
import { assertTenantContext, resetSafeQueryCache } from "@src/utils/security/safe-query";

describe("SystemTenantScope brand", () => {
  beforeEach(() => {
    (globalThis as any).__privateEnv = { MULTI_TENANT: true };
    resetSafeQueryCache();
  });

  it("createSystemTenantScope produces isSystemTenantScope-true values", () => {
    const scope = createSystemTenantScope("scheduler");
    expect(scope.kind).toBe("system");
    expect(scope.reason).toBe("scheduler");
    expect(isSystemTenantScope(scope)).toBe(true);
  });

  it("rejects plain objects that look like system scopes", () => {
    expect(isSystemTenantScope({ kind: "system", reason: "scheduler" })).toBe(false);
    expect(isSystemTenantScope({ kind: "system", reason: "scheduler", brand: true })).toBe(false);
    expect(isSystemTenantScope(null)).toBe(false);
    expect(isSystemTenantScope(undefined)).toBe(false);
  });

  it("withSystemScope attaches a valid brand", () => {
    const opts = withSystemScope("testing", { limit: 5 });
    expect(opts.limit).toBe(5);
    expect(isSystemTenantScope(opts.systemScope)).toBe(true);
    expect(hasTenantBypass(opts)).toBe(true);
  });

  it("hasTenantBypass accepts systemScope and legacy boolean", () => {
    expect(hasTenantBypass(withSystemScope("bootstrap"))).toBe(true);
    expect(hasTenantBypass({ bypassTenantCheck: true })).toBe(true);
    expect(hasTenantBypass({ bypassSafeQuery: true })).toBe(true);
    expect(hasTenantBypass({})).toBe(false);
    expect(hasTenantBypass({ systemScope: { kind: "system", reason: "x" } as any })).toBe(false);
  });

  it("assertTenantContext accepts branded scope under MT", () => {
    expect(() => assertTenantContext(withSystemScope("scheduler") as any, "jobs")).not.toThrow();
  });

  it("assertTenantContext rejects forged scope under MT", () => {
    expect(() =>
      assertTenantContext({ systemScope: { kind: "system", reason: "scheduler" } } as any, "jobs"),
    ).toThrow(/Security Violation/);
  });
});
