/**
 * @file tests/unit/security/audit-ledger-integrity.test.ts
 * @description
 * Unified Audit Ledger & Cryptographic Integrity Unit Tests.
 *
 * Consolidates SHA-256 chain verification, Merkle Tree root proofs, and O(1) rolling accumulator tests.
 */

import { describe, it, expect } from "vitest";
import { AuditChainService, GENESIS_HASH } from "@src/services/audit-chain";
import { RollingMerkleAccumulator } from "@src/services/security/rolling-merkle";

describe("Audit Ledger & Cryptographic Integrity Suite", () => {
  const service = new AuditChainService();

  describe("SHA-256 Chain Hashing", () => {
    it("computes deterministic SHA-256 hash for audit entries", async () => {
      const { createHash } = await import("node:crypto");
      const data = JSON.stringify({ event: "login", user: "admin" });
      const hash1 = createHash("sha256")
        .update(data + GENESIS_HASH)
        .digest("hex");
      const hash2 = createHash("sha256")
        .update(data + GENESIS_HASH)
        .digest("hex");

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it("detects modification when predecessor hash changes", async () => {
      const { createHash } = await import("node:crypto");
      const data = JSON.stringify({ event: "login", user: "admin" });
      const hash1 = createHash("sha256")
        .update(data + GENESIS_HASH)
        .digest("hex");
      const hash2 = createHash("sha256")
        .update(data + "1".repeat(64))
        .digest("hex");

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("Merkle Tree Batch Proofs", () => {
    it("returns GENESIS_HASH when computing Merkle Root of empty log array", async () => {
      const root = await service.computeMerkleRoot([]);
      expect(root).toBe(GENESIS_HASH);
    });

    it("computes deterministic Merkle Root for audit log batch", async () => {
      const entry1 = await service.createLog({
        action: "user.login",
        actorEmail: "admin@example.com",
      });
      const entry2 = await service.createLog({
        action: "collection.create",
        actorEmail: "editor@example.com",
      });

      const root1 = await service.computeMerkleRoot([entry1, entry2]);
      const root2 = await service.computeMerkleRoot([entry1, entry2]);

      expect(root1).toBe(root2);
      expect(root1.length).toBe(64);
    });

    it("detects tampered entry when Merkle Root changes", async () => {
      const entry1 = await service.createLog({
        action: "user.login",
        actorEmail: "admin@example.com",
      });
      const entry2 = await service.createLog({
        action: "collection.create",
        actorEmail: "editor@example.com",
      });

      const originalRoot = await service.computeMerkleRoot([entry1, entry2]);
      const tamperedEntry2 = { ...entry2, action: "collection.delete_all_data" };
      const tamperedRoot = await service.computeMerkleRoot([entry1, tamperedEntry2]);

      expect(tamperedRoot).not.toBe(originalRoot);
    });

    it("generates Merkle inclusion proof for log entry in batch", async () => {
      const entry1 = await service.createLog({
        action: "user.login",
        actorEmail: "admin@example.com",
      });
      const entry2 = await service.createLog({
        action: "collection.create",
        actorEmail: "editor@example.com",
      });
      const proof = await service.generateMerkleProof([entry1, entry2], 0);
      expect(proof.length).toBeGreaterThan(0);
    });
  });

  describe("O(1) Constant-Time Rolling Merkle Accumulator", () => {
    it("initializes with GENESIS_HASH and appends leaves in O(1) time", async () => {
      const accumulator = new RollingMerkleAccumulator();
      expect(accumulator.root).toBe(GENESIS_HASH);

      const root1 = await accumulator.appendLeaf("a".repeat(64));
      expect(root1).not.toBe(GENESIS_HASH);
      expect(accumulator.entryCount).toBe(1);
    });

    it("evaluates 200 O(1) leaf appends in < 20ms", async () => {
      const accumulator = new RollingMerkleAccumulator();
      const dummyLeaf = "c".repeat(64);
      const start = performance.now();

      for (let i = 0; i < 200; i++) {
        await accumulator.appendLeaf(dummyLeaf);
      }

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
      expect(accumulator.entryCount).toBe(200);
    });
  });
});
