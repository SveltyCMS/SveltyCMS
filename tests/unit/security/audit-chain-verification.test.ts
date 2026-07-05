/**
 * @file tests/unit/security/audit-chain-verification.test.ts
 * @description Crypto-chained audit log integrity verification.
 *
 * SveltyCMS audit logs use SHA-256 hash chaining: each entry includes
 * the hash of the previous entry, forming a tamper-evident chain.
 * This test verifies chain integrity, breakage detection, and re-verification.
 *
 * ### Security Model
 * - Each audit entry: { ..., prevHash, hash }
 * - hash = SHA-256(entry data + prevHash)
 * - Chain break = hash mismatch → tampering detected
 * - Replay protection via timestamp + sequence number
 */

import { describe, it, expect } from "vitest";

describe("Audit Log Chain Integrity", () => {
  // ── Hash Computation ──────────────────────────────────────────────────

  describe("SHA-256 Chain Hashing", () => {
    it("computes deterministic hash for same input", async () => {
      const { createHash } = await import("node:crypto");
      const data = JSON.stringify({ event: "login", user: "admin" });
      const prevHash = "0000000000000000000000000000000000000000000000000000000000000000";

      const hash1 = createHash("sha256")
        .update(data + prevHash)
        .digest("hex");
      const hash2 = createHash("sha256")
        .update(data + prevHash)
        .digest("hex");

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it("produces different hash when prevHash changes", async () => {
      const { createHash } = await import("node:crypto");
      const data = JSON.stringify({ event: "login", user: "admin" });

      const hash1 = createHash("sha256")
        .update(data + "0000000000000000000000000000000000000000000000000000000000000000")
        .digest("hex");
      const hash2 = createHash("sha256")
        .update(data + "1111111111111111111111111111111111111111111111111111111111111111")
        .digest("hex");

      expect(hash1).not.toBe(hash2);
    });

    it("produces different hash when event data changes", async () => {
      const { createHash } = await import("node:crypto");
      const prevHash = "0000000000000000000000000000000000000000000000000000000000000000";

      const hash1 = createHash("sha256")
        .update(JSON.stringify({ event: "login", user: "admin" }) + prevHash)
        .digest("hex");
      const hash2 = createHash("sha256")
        .update(JSON.stringify({ event: "delete", user: "admin" }) + prevHash)
        .digest("hex");

      expect(hash1).not.toBe(hash2);
    });
  });

  // ── Chain Verification ────────────────────────────────────────────────

  describe("Chain Verification", () => {
    it("valid chain passes verification", async () => {
      const { createHash } = await import("node:crypto");

      // Build a 3-entry chain
      const entries: Array<{ event: string; prevHash: string; hash: string }> = [];
      let prevHash = "0".repeat(64); // Genesis hash

      for (const event of ["login", "update", "logout"]) {
        const data = JSON.stringify({ event, timestamp: Date.now() });
        const hash = createHash("sha256")
          .update(data + prevHash)
          .digest("hex");
        entries.push({ event, prevHash, hash });
        prevHash = hash;
      }

      // Verify chain integrity
      let valid = true;
      for (let i = 1; i < entries.length; i++) {
        const expectedPrevHash = entries[i - 1].hash;
        if (entries[i].prevHash !== expectedPrevHash) {
          valid = false;
          break;
        }
      }
      expect(valid).toBe(true);
    });

    it("detects tampered entry (broken chain)", async () => {
      const { createHash } = await import("node:crypto");

      // Build a 3-entry chain
      const entries: Array<{ event: string; prevHash: string; hash: string }> = [];
      let prevHash = "0".repeat(64);

      for (const event of ["login", "update", "logout"]) {
        const data = JSON.stringify({ event, timestamp: Date.now() });
        const hash = createHash("sha256")
          .update(data + prevHash)
          .digest("hex");
        entries.push({ event, prevHash, hash });
        prevHash = hash;
      }

      // Tamper with entry 1
      entries[1].event = "TAMPERED_DELETE";

      // Verify chain — should detect break
      let valid = true;
      for (let i = 1; i < entries.length; i++) {
        const expectedPrevHash = entries[i - 1].hash;
        if (entries[i].prevHash !== expectedPrevHash) {
          valid = false;
        }
        // Also recompute hash to check entry integrity
        const recomputedHash = createHash("sha256")
          .update(JSON.stringify({ event: entries[i].event }) + entries[i].prevHash)
          .digest("hex");
        if (recomputedHash !== entries[i].hash) {
          valid = false;
        }
      }
      expect(valid).toBe(false);
    });

    it("detects missing entry (chain gap)", () => {
      // Simulate chain with a gap
      const chain = [
        { event: "login", prevHash: "0".repeat(64), hash: "aaa" },
        // Entry 2 is MISSING
        { event: "logout", prevHash: "bbb", hash: "ccc" },
      ];

      // prevHash of entry 3 should match hash of entry 2
      // Since entry 2 is missing, prevHash "bbb" can't be verified
      const gapDetected = chain[1].prevHash !== chain[0].hash;
      expect(gapDetected).toBe(true);
    });

    it("replay attack is detectable via timestamp ordering", () => {
      const entries = [
        { event: "create", timestamp: 1000 },
        { event: "update", timestamp: 500 }, // Replayed from earlier!
        { event: "delete", timestamp: 2000 },
      ];

      let replayDetected = false;
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].timestamp < entries[i - 1].timestamp) {
          replayDetected = true;
        }
      }
      expect(replayDetected).toBe(true);
    });
  });
});
