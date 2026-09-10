/**
 * @file tests/unit/rate-limit/adaptive.test.ts
 * @description Tests für die adaptive Throttling-Schicht (tenantId/userId → Kapazität).
 */
import { describe, expect, it } from "vitest";
import {
  computeAdaptiveBucket,
  resolveUserTier,
  type BaseRateLimitConfig,
} from "@utils/rate-limit/adaptive";

const BASE: BaseRateLimitConfig = {
  capacity: 100,
  refillPerSecond: 100 / 60, // 100 Tokens pro 60s-Fenster
  maxRequests: 100,
  windowMs: 60_000,
};

describe("resolveUserTier", () => {
  it("admin via role", () => expect(resolveUserTier({ role: "admin" })).toBe("admin"));
  it("admin via isAdmin-Flag", () => expect(resolveUserTier({ isAdmin: true })).toBe("admin"));
  it("staff/editor → staff", () => expect(resolveUserTier({ role: "editor" })).toBe("staff"));
  it("userId vorhanden → guest", () => expect(resolveUserTier({ userId: "u1" })).toBe("guest"));
  it("kein user/role → anonymous", () => expect(resolveUserTier({})).toBe("anonymous"));
});

describe("computeAdaptiveBucket", () => {
  it("Admin bekommt mehr Kapazitaet als Gast", () => {
    const admin = computeAdaptiveBucket(BASE, { role: "admin", tenantId: "global" });
    const guest = computeAdaptiveBucket(BASE, { userId: "u1", tenantId: "global" });
    expect(admin.capacity).toBeGreaterThan(guest.capacity);
  });

  it("Multitenant skaliert gegenueber global", () => {
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

  it("anonym (ohne Identitaet) bleibt unter der Basis-Kapazitaet", () => {
    const anon = computeAdaptiveBucket(BASE, { tenantId: "global" });
    expect(anon.capacity).toBeLessThan(BASE.capacity);
  });

  it("registrierter Gast (userId) bleibt auf Basis-Niveau (1.0x)", () => {
    const guest = computeAdaptiveBucket(BASE, { userId: "u1", tenantId: "global" });
    expect(guest.capacity).toBe(BASE.capacity);
  });
});
