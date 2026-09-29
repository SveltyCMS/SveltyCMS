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

  it("hasTenantBypass accepts branded systemScope only", () => {
    expect(hasTenantBypass(withSystemScope("bootstrap"))).toBe(true);
    expect(hasTenantBypass({ bypassTenantCheck: true } as any)).toBe(false);
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

  it("validates scopes across duplicated module instances", async () => {
    const first = await import("@src/databases/system-tenant-scope");
    const scope = first.createSystemTenantScope("scheduler");

    // The registry is parked on globalThis precisely so every copy of this
    // module shares it — that is the cross-copy property under test. Asserting
    // it directly keeps this pin meaningful under both runners: vitest (unit
    // suite) can re-evaluate the module, the tenant gate's `bun test` cannot.
    const registry = (globalThis as { __SVELTY_SYSTEM_SCOPE_REGISTRY__?: WeakSet<object> })
      .__SVELTY_SYSTEM_SCOPE_REGISTRY__;
    expect(registry).toBeInstanceOf(WeakSet);
    expect(registry?.has(scope)).toBe(true);

    const vitest = vi as unknown as { resetModules?: () => void };
    if (typeof vitest.resetModules !== "function") return;
    vitest.resetModules();

    // Simulate a second copy of this module: Vite's dev SSR runner can load it
    // alongside the statically imported one, and production chunking can
    // duplicate it. Copy B must recognise a scope minted by copy A — a
    // module-local Symbol brand failed here and silently rejected system work.
    const second = await import("@src/databases/system-tenant-scope");
    expect(second.isSystemTenantScope(scope)).toBe(true);
    expect(second.hasTenantBypass({ systemScope: scope })).toBe(true);
    // Forged objects still never pass, in either copy.
    expect(second.isSystemTenantScope({ kind: "system", reason: "scheduler" })).toBe(false);
  });
});
