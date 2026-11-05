/**
 * @file tests/unit/security/cloud-kms.test.ts
 * @description Unit tests for Cloud KMS Envelope Encryption Engine and field integration.
 *
 * ### Features:
 * - Local KMS master key derivation and envelope DEK lifecycle
 * - Memory-isolated DEK cache with instant synchronous retrieval
 * - End-to-end field encryption/decryption with KMS-backed keys
 * - Tamper resistance and AAD context binding
 * - High-speed zero-latency sub-millisecond encryption benchmarks
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cloudKms } from "@src/utils/security/cloud-kms";
import {
  encryptFieldValueSync,
  decryptFieldValueSync,
  resetFieldEncryptionKeyCache,
} from "@src/utils/security/field-encryption";

describe("Cloud KMS Envelope Encryption Engine", () => {
  beforeEach(() => {
    cloudKms.reset();
    resetFieldEncryptionKeyCache();
  });

  afterEach(() => {
    cloudKms.reset();
    resetFieldEncryptionKeyCache();
    delete process.env.KMS_PROVIDER;
    delete process.env.KMS_KEY_ID;
  });

  it("initializes LocalKmsAdapter and generates a valid DEK", async () => {
    cloudKms.configure({
      provider: "local",
      keyId: "arn:aws:kms:us-east-1:123456789012:key/test-master-key",
      dekTtlMs: 3600_000,
    });

    const dek = await cloudKms.rotateOrGetActiveDek();
    expect(dek).toBeDefined();
    expect(dek.keyId).toContain("kms.local.");
    expect(dek.plaintext.length).toBe(32); // 256 bits
    expect(dek.encrypted).toContain(".");
    expect(dek.expiresAt).toBeGreaterThan(Date.now());
  });

  it("serves active DEK synchronously from in-memory cache", async () => {
    cloudKms.configure({
      provider: "local",
      keyId: "master-key-001",
    });

    // Before rotation: null
    expect(cloudKms.getActiveDekSync()).toBeNull();

    await cloudKms.rotateOrGetActiveDek();

    // After rotation: instant sync retrieval
    const syncDek = cloudKms.getActiveDekSync();
    expect(syncDek).not.toBeNull();
    expect(syncDek?.plaintext.length).toBe(32);
  });

  it("encrypts and decrypts collection field with KMS envelope", async () => {
    process.env.KMS_PROVIDER = "local";
    process.env.KMS_KEY_ID = "enterprise-vault-key";

    await cloudKms.initialize();

    const context = {
      tenantId: "tenant-acme",
      collectionId: "customers",
    };
    const secretData = {
      ssn: "123-45-6789",
      creditCard: "4111-2222-3333-4444",
      balance: 15420.5,
    };

    const envelope = encryptFieldValueSync(secretData, context, "billing");
    expect(envelope).toMatch(/^v2:kms\.local\.enterprise-vault-key\./);

    const decrypted = decryptFieldValueSync(envelope, context, "billing");
    expect(decrypted).toEqual(secretData);
  });

  it("fails closed when ciphertext or AAD is tampered", async () => {
    process.env.KMS_PROVIDER = "local";
    process.env.KMS_KEY_ID = "enterprise-vault-key";

    await cloudKms.initialize();

    const context = {
      tenantId: "tenant-acme",
      collectionId: "customers",
    };
    const envelope = encryptFieldValueSync("classified-data", context, "notes");

    // Attempt decryption under a different tenant (swap attack)
    const tamperedTenant = decryptFieldValueSync(
      envelope,
      { tenantId: "tenant-evil", collectionId: "customers" },
      "notes",
    );
    expect(tamperedTenant).toBeNull();

    // Attempt decryption under a different field name
    const tamperedField = decryptFieldValueSync(envelope, context, "other_field");
    expect(tamperedField).toBeNull();
  });

  it("benchmark: executes in-memory KMS envelope encryption in < 0.05 ms", async () => {
    process.env.KMS_PROVIDER = "local";
    await cloudKms.initialize();

    const context = { tenantId: "t1", collectionId: "c1" };
    const value = { email: "admin@enterprise.corp", role: "superadmin" };

    // JIT Warm-up (minimum 1,000 iterations per AGENTS.md benchmark parity rule)
    for (let i = 0; i < 1000; i++) {
      const env = encryptFieldValueSync(value, context, "data");
      decryptFieldValueSync(env, context, "data");
    }

    const start = performance.now();
    const iterations = 1000;
    for (let i = 0; i < iterations; i++) {
      const env = encryptFieldValueSync(value, context, "data");
      decryptFieldValueSync(env, context, "data");
    }
    const elapsed = performance.now() - start;
    const perOpMs = elapsed / iterations;

    // In CI or under Vitest code coverage instrumentation, allow virtualized runner overhead.
    // On bare hardware, assert the < 0.05 ms (50 microseconds) budget.
    const maxBudgetMs = process.env.CI || process.env.COVERAGE ? 0.5 : 0.05;
    expect(perOpMs).toBeLessThan(maxBudgetMs);
  });
});
