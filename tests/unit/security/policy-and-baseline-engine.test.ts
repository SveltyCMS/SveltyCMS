/**
 * @file tests/unit/security/policy-and-baseline-engine.test.ts
 * @description
 * Unified Policy Engine, Bitmask Authorization, Baseline Guard, and Session Bitset Unit Tests.
 *
 * Consolidates Policy-as-Code evaluation, 64-bit hardware bitmask checks, zero-overhead baseline clamping,
 * and sub-microsecond active session tracking.
 */

import { describe, it, expect } from "vitest";
import { PolicyEngine } from "@src/services/security/policy-engine";
import { BitmaskPolicyEngine, PERM_BITS } from "@src/services/security/bitmask-policy-engine";
import { BaselineGuard } from "@src/services/security/baseline-guard";
import { securityBaseline } from "@src/config/security-baseline";
import { SessionBitset } from "@src/services/security/session-bitset";

describe("Policy Engine & Baseline Guard Security Suite", () => {
  describe("PolicyEngine (Policy-as-Code)", () => {
    const engine = new PolicyEngine();

    it("grants full access to admin users immediately (fast-path)", () => {
      const adminUser = { role: "admin", isAdmin: true };
      expect(engine.evaluate(adminUser, "collection:posts", "delete")).toBe(true);
    });

    it("evaluates editor role permissions for collection resources", () => {
      const editor = { role: "editor" };
      expect(engine.evaluate(editor, "collection:articles", "read")).toBe(true);
      expect(engine.evaluate(editor, "system:settings", "write")).toBe(false);
    });

    it("evaluates author dynamic condition (own content check)", () => {
      const author = { _id: "user-123", role: "author" };
      expect(engine.evaluate(author, "collection:posts", "update", { authorId: "user-123" })).toBe(
        true,
      );
      expect(engine.evaluate(author, "collection:posts", "update", { authorId: "user-456" })).toBe(
        false,
      );
    });
  });

  describe("BitmaskPolicyEngine (Hardware Bitwise Authorization)", () => {
    const bitmaskEngine = new BitmaskPolicyEngine();

    it("grants access to admin for any required bitmask instantly", () => {
      expect(bitmaskEngine.evaluateBitmask("admin", PERM_BITS.MANAGE | PERM_BITS.DELETE)).toBe(
        true,
      );
    });

    it("evaluates editor permissions via single bitwise AND instruction", () => {
      expect(bitmaskEngine.evaluateBitmask("editor", PERM_BITS.READ)).toBe(true);
      expect(bitmaskEngine.evaluateBitmask("editor", PERM_BITS.MANAGE)).toBe(false);
    });

    it("evaluates 10,000 hardware bitwise authorization checks in < 5ms", () => {
      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        bitmaskEngine.evaluateBitmask("editor", PERM_BITS.READ | PERM_BITS.UPDATE);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(5);
    });
  });

  describe("BaselineGuard (Runtime Security Baseline Clamping)", () => {
    it("clamps weak minPasswordLength setting to baseline floor", () => {
      const weakDbSettings = { minPasswordLength: 4 };
      const effective = BaselineGuard.getEffectiveSettings(weakDbSettings);
      expect(effective.minPasswordLength).toBe(securityBaseline.minPasswordLength);
    });

    it("always includes mandatory forbidden file extensions", () => {
      const customDbSettings = { disallowedFileExtensions: ["custom_virus"] };
      const effective = BaselineGuard.getEffectiveSettings(customDbSettings);
      expect(effective.disallowedFileExtensions).toContain("exe");
      expect(effective.disallowedFileExtensions).toContain("php");
      expect(effective.disallowedFileExtensions).toContain("custom_virus");
    });
  });

  describe("SessionBitset (Sub-Microsecond Hot-Path Session Guard)", () => {
    const sessionGuard = new SessionBitset();

    it("marks session active and verifies in nanoseconds", () => {
      sessionGuard.markActive("user-123");
      expect(sessionGuard.isActive("user-123")).toBe(true);

      sessionGuard.markInactive("user-123");
      expect(sessionGuard.isActive("user-123")).toBe(false);
    });

    it("evaluates 10,000 session checks in < 5ms", () => {
      sessionGuard.markActive("user-999");
      const start = performance.now();

      for (let i = 0; i < 10000; i++) {
        sessionGuard.isActive("user-999");
      }

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(5);
    });
  });
});
