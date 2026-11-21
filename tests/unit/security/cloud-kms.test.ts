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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cloudKms, signAwsKmsRequest } from "@src/utils/security/cloud-kms";
import { AppError } from "@utils/error-handling";
import {
  encryptFieldValueSync,
  decryptFieldValueSync,
  resetFieldEncryptionKeyCache,
} from "@src/utils/security/field-encryption";

const TEST_MASTER_KEY = "b1c2d3e4f5a6b1c2d3e4f5a6b1c2d3e4b1c2d3e4f5a6b1c2d3e4f5a6b1c2d3e4";

describe("Cloud KMS Envelope Encryption Engine", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_MASTER_KEY);
    cloudKms.reset();
    resetFieldEncryptionKeyCache();
  });

  afterEach(() => {
    cloudKms.reset();
    resetFieldEncryptionKeyCache();
    vi.unstubAllEnvs();
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

  it("benchmark: keeps in-memory KMS envelope encryption sub-millisecond", async () => {
    process.env.KMS_PROVIDER = "local";
    await cloudKms.initialize();

    const context = { tenantId: "t1", collectionId: "c1" };
    const value = { email: "admin@enterprise.corp", role: "superadmin" };

    // JIT Warm-up (minimum 1,000 iterations per AGENTS.md benchmark parity rule)
    for (let i = 0; i < 1000; i++) {
      const env = encryptFieldValueSync(value, context, "data");
      decryptFieldValueSync(env, context, "data");
    }

    // Median of batches, not one total/iterations quotient: a GC pause or a
    // concurrent pre-commit worker skews a single batch but not the median.
    const BATCHES = 5;
    const ITERATIONS = 200;
    const perOpSamples: number[] = [];
    for (let batch = 0; batch < BATCHES; batch++) {
      const start = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        const env = encryptFieldValueSync(value, context, "data");
        decryptFieldValueSync(env, context, "data");
      }
      perOpSamples.push((performance.now() - start) / ITERATIONS);
    }
    perOpSamples.sort((a, b) => a - b);
    const medianPerOpMs = perOpSamples[Math.floor(BATCHES / 2)];

    // The benchmark suite runs this file with BENCHMARK=1 and keeps the strict
    // 50 microsecond budget. The normal unit run (including the parallel
    // pre-commit worker) allows Vitest/CI virtualization overhead.
    const maxBudgetMs = process.env.BENCHMARK === "1" ? 0.05 : 0.5;
    expect(medianPerOpMs).toBeLessThan(maxBudgetMs);
  });

  it("fails closed for local KMS when ENCRYPTION_KEY is missing (no hardcoded fallback)", () => {
    vi.stubEnv("ENCRYPTION_KEY", undefined);
    vi.stubEnv("SECRET_ENCRYPTION_KEY", undefined);
    expect(() =>
      cloudKms.configure({
        provider: "local",
        keyId: "master-key",
      }),
    ).toThrowError(AppError);
    try {
      cloudKms.configure({ provider: "local", keyId: "master-key" });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("KMS_MASTER_KEY_MISSING");
    }
  });

  it("refuses unimplemented cloud providers instead of silently falling back to local KMS", () => {
    for (const provider of ["gcp-kms", "azure-kv"] as const) {
      let caught: unknown;
      try {
        cloudKms.configure({ provider, keyId: "cloud-key" });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AppError);
      expect((caught as AppError).code).toBe("KMS_PROVIDER_UNSUPPORTED");
    }
  });

  it("requires credentials for AWS KMS and Vault, and signs AWS KMS requests with SigV4", () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", undefined);
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", undefined);

    expect(() =>
      cloudKms.configure({ provider: "aws-kms", keyId: "alias/svelty", region: "eu-central-1" }),
    ).toThrowError(/SigV4/i);

    expect(() =>
      cloudKms.configure({ provider: "vault", keyId: "svelty", token: "" }),
    ).toThrowError(/KMS_TOKEN/i);

    const headers = signAwsKmsRequest({
      url: new URL("https://kms.eu-central-1.amazonaws.com/"),
      region: "eu-central-1",
      target: "TrentService.GenerateDataKey",
      body: JSON.stringify({ KeyId: "alias/svelty", KeySpec: "AES_256" }),
      credentials: {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        sessionToken: "session-token-123",
      },
      now: new Date("2026-11-21T22:00:00.000Z"),
    });

    expect(headers["X-Amz-Date"]).toBe("20261121T220000Z");
    expect(headers["X-Amz-Target"]).toBe("TrentService.GenerateDataKey");
    expect(headers["X-Amz-Security-Token"]).toBe("session-token-123");
    expect(headers["X-Amz-Content-Sha256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(headers.Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20261121\/eu-central-1\/kms\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token;x-amz-target, Signature=[0-9a-f]{64}$/,
    );
  });

  it("keeps decrypting rows encrypted under a rotated DEK while cached and wipes plaintext on reset", async () => {
    cloudKms.configure({ provider: "local", keyId: "rotating-key", dekTtlMs: 1 });
    const firstDek = await cloudKms.rotateOrGetActiveDek();
    const ctx = { tenantId: "t1", collectionId: "secrets" };
    const firstEnvelope = encryptFieldValueSync("before-rotation", ctx, "token");

    // Wait briefly so TTL expires and rotate produces a fresh DEK
    await new Promise((r) => setTimeout(r, 10));
    const secondDek = await cloudKms.rotateOrGetActiveDek();
    expect(secondDek.keyId).not.toBe(firstDek.keyId);

    // Envelope encrypted under the first DEK must still decrypt via getCachedDekSync
    expect(decryptFieldValueSync(firstEnvelope, ctx, "token")).toBe("before-rotation");

    // Reset must zero out plaintext DEK bytes in place
    const firstBufRef = firstDek.plaintext;
    cloudKms.reset();
    expect(firstBufRef.every((byte) => byte === 0)).toBe(true);
  });
});
