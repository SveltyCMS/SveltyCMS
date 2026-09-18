/**
 * @file tests/unit/rate-limit/adaptive.test.ts
 * @description Tests für die adaptive Throttling-Schicht (tenantId/userId → Kapazität).
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  computeAdaptiveBucket,
  resolveUserTier,
  type BaseRateLimitConfig,
} from "@utils/rate-limit/adaptive";
import { seedRoleTier, _resetRoleTiers } from "@utils/rate-limit/role-tiers";
import { seedTenantPlan, _resetTenantPlans } from "@utils/rate-limit/tenant-plan";

const BASE: BaseRateLimitConfig = {
  capacity: 100,
  refillPerSecond: 100 / 60, // 100 Tokens pro 60s-Fenster
  maxRequests: 100,
  windowMs: 60_000,
};

describe("resolveUserTier", () => {
  afterEach(() => {
    _resetRoleTiers();
    _resetTenantPlans();
  });

  it("admin via role", () => expect(resolveUserTier({ role: "admin" })).toBe("admin"));
  it("admin via isAdmin-Flag", () => expect(resolveUserTier({ isAdmin: true })).toBe("admin"));
  it("RBAC-seeded editor → staff", () => {
    seedRoleTier("editor", { permissions: ["collection:write"] });
    expect(resolveUserTier({ role: "editor" })).toBe("staff");
  });
  it("unseeded named role with userId → guest", () =>
    expect(resolveUserTier({ role: "editor", userId: "u1" })).toBe("guest"));
  it("userId vorhanden → guest", () => expect(resolveUserTier({ userId: "u1" })).toBe("guest"));
  it("kein user/role → anonymous", () => expect(resolveUserTier({})).toBe("anonymous"));
});

describe("computeAdaptiveBucket", () => {
  afterEach(() => {
    _resetRoleTiers();
    _resetTenantPlans();
  });

  it("Admin bekommt mehr Kapazitaet als Gast", () => {
    const admin = computeAdaptiveBucket(BASE, { role: "admin", tenantId: "global" });
    const guest = computeAdaptiveBucket(BASE, { userId: "u1", tenantId: "global" });
    expect(admin.capacity).toBeGreaterThan(guest.capacity);
  });

  it("enterprise plan cache scales vs free/global", () => {
    seedTenantPlan("acme", "enterprise");
    const tenant = computeAdaptiveBucket(BASE, { userId: "u1", tenantId: "acme" });
    const global = computeAdaptiveBucket(BASE, { userId: "u1", tenantId: "global" });
    expect(tenant.capacity).toBeGreaterThan(global.capacity);
  });

  it("Kapazitaet ist nie kleiner als 1", () => {
    const anon = computeAdaptiveBucket(BASE, { tenantId: "global" });
    expect(anon.capacity).toBeGreaterThanOrEqual(1);
  });

  it("Refill skaliert proportional zur Kapazitaet (Zeit zum Vollauf konstant)", () => {
    const base = { ...BASE, capacity: 100, refillPerSecond: 10 };
    const admin = computeAdaptiveBucket(base, { role: "admin", tenantId: "global" });
    // capacity/refill sollte konstant = base.capacity/base.refill = 10 sein
    const ratioBase = base.capacity / base.refillPerSecond;
    const ratioAdmin = admin.capacity / admin.refillPerSecond;
    expect(ratioAdmin).toBeCloseTo(ratioBase, 0);
  });

  it("anonymous stays at 1× base capacity", () => {
    const anon = computeAdaptiveBucket(BASE, { tenantId: "global" });
    expect(anon.capacity).toBe(BASE.capacity);
  });

  it("authenticated guest is 2× base capacity", () => {
    const guest = computeAdaptiveBucket(BASE, { userId: "u1", tenantId: "global" });
    expect(guest.capacity).toBe(BASE.capacity * 2);
  });

  it("zero or NaN base capacity still yields a usable bucket", () => {
    const zero = computeAdaptiveBucket({ ...BASE, capacity: 0, refillPerSecond: 0 }, {});
    expect(zero.capacity).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(zero.refillPerSecond)).toBe(true);
    expect(zero.refillPerSecond).toBeGreaterThan(0);
  });

  it("role Admin mixed case still maps to admin", () => {
    expect(resolveUserTier({ role: "Admin" })).toBe("admin");
  });
});
