/**
 * @file tests/unit/utils/field-encryption.test.ts
 * @description Unit tests for native field-level AES-256-GCM envelopes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  encryptFieldValue,
  decryptFieldValue,
  encryptDocumentFields,
  decryptDocumentFields,
  isFieldEncryptionEnvelope,
  resetFieldEncryptionKeyCache,
} from "@utils/security/field-encryption";
import { AppError } from "@utils/error-handling";

const ENCRYPTION_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
const CTX = { collectionId: "contacts", tenantId: "tenant_a" };

describe("field-level AES-256-GCM encryption", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", ENCRYPTION_KEY);
    resetFieldEncryptionKeyCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetFieldEncryptionKeyCache();
  });

  it("round-trips a string through a v2 key-ID envelope", async () => {
    const envelope = await encryptFieldValue("ssn-123", CTX, "ssn");
    expect(isFieldEncryptionEnvelope(envelope)).toBe(true);
    expect(/^v2:[A-Za-z0-9._-]{1,64}:/.test(envelope)).toBe(true);
    expect(envelope).not.toContain("ssn-123");
    expect(await decryptFieldValue(envelope, CTX, "ssn")).toBe("ssn-123");
  });

  it("round-trips translated objects and numbers via JSON encoding", async () => {
    const obj = { en: "secret note", de: "geheime notiz" };
    const envelope = await encryptFieldValue(obj, CTX, "notes");
    expect(await decryptFieldValue(envelope, CTX, "notes")).toEqual(obj);

    const numEnvelope = await encryptFieldValue(42, CTX, "code");
    expect(await decryptFieldValue(numEnvelope, CTX, "code")).toBe(42);
  });

  it("produces unique ciphertext for the same plaintext (random IV)", async () => {
    const a = await encryptFieldValue("same", CTX, "ssn");
    const b = await encryptFieldValue("same", CTX, "ssn");
    expect(a).not.toBe(b);
    expect(await decryptFieldValue(a, CTX, "ssn")).toBe("same");
    expect(await decryptFieldValue(b, CTX, "ssn")).toBe("same");
  });

  it("is idempotent — encrypting an envelope returns it unchanged", async () => {
    const envelope = await encryptFieldValue("once", CTX, "ssn");
    expect(await encryptFieldValue(envelope, CTX, "ssn")).toBe(envelope);
  });

  it("returns null for tampered ciphertext", async () => {
    const envelope = await encryptFieldValue("secret", CTX, "ssn");
    const tampered = envelope.slice(0, -2) + "xx";
    expect(await decryptFieldValue(tampered, CTX, "ssn")).toBeNull();
  });

  it("fails closed when AAD (tenant/collection/field) does not match", async () => {
    const envelope = await encryptFieldValue("secret", CTX, "ssn");
    expect(await decryptFieldValue(envelope, { ...CTX, tenantId: "other" }, "ssn")).toBeNull();
    expect(await decryptFieldValue(envelope, CTX, "other_field")).toBeNull();
  });

  it("passes through legacy plaintext on decrypt", async () => {
    expect(await decryptFieldValue("already-plain", CTX, "ssn")).toBe("already-plain");
  });

  it("encrypts and decrypts flagged document fields in place", async () => {
    const doc: Record<string, unknown> = {
      title: "Public",
      ssn: "111-22-3333",
      apiKey: "sk_live_abc",
    };
    await encryptDocumentFields(doc, ["ssn", "apiKey"], CTX);
    expect(doc.title).toBe("Public");
    expect(isFieldEncryptionEnvelope(doc.ssn)).toBe(true);
    expect(isFieldEncryptionEnvelope(doc.apiKey)).toBe(true);
    expect(doc.ssn).not.toBe("111-22-3333");

    await decryptDocumentFields(doc, ["ssn", "apiKey"], CTX);
    expect(doc.ssn).toBe("111-22-3333");
    expect(doc.apiKey).toBe("sk_live_abc");
  });

  it("skips empty values on encrypt", async () => {
    const doc: Record<string, unknown> = { ssn: "", notes: null };
    await encryptDocumentFields(doc, ["ssn", "notes"], CTX);
    expect(doc.ssn).toBe("");
    expect(doc.notes).toBeNull();
  });

  it("throws FIELD_ENCRYPTION_UNAVAILABLE when ENCRYPTION_KEY is missing", async () => {
    vi.stubEnv("ENCRYPTION_KEY", undefined);
    vi.stubEnv("SECRET_ENCRYPTION_KEY", undefined);
    resetFieldEncryptionKeyCache();
    await expect(encryptFieldValue("x", CTX, "ssn")).rejects.toSatisfy((err: unknown) => {
      return err instanceof AppError && err.code === "FIELD_ENCRYPTION_UNAVAILABLE";
    });
  });

  describe("hybrid PQC field encryption (ML-KEM-768)", () => {
    it("round-trips field value with ML-KEM hybrid envelope when PQC_HYBRID_FIELDS=true", async () => {
      const { generateKemKeyPair, isMlKemAvailable, isHybridEnvelope } =
        await import("@utils/security/hybrid-kem");
      if (!(await isMlKemAvailable())) return;

      const keys = await generateKemKeyPair();
      vi.stubEnv("PQC_HYBRID_FIELDS", "true");
      vi.stubEnv("KEM_PUBLIC_KEY", keys.publicKey);
      vi.stubEnv("KEM_PRIVATE_KEY", keys.privateKey);

      const envelope = await encryptFieldValue("quantum-sensitive-data", CTX, "secretField");
      expect(isFieldEncryptionEnvelope(envelope)).toBe(true);
      expect(isHybridEnvelope(envelope)).toBe(true);
      expect(envelope.split(":")).toHaveLength(9);

      const decrypted = await decryptFieldValue(envelope, CTX, "secretField");
      expect(decrypted).toBe("quantum-sensitive-data");

      // AAD mismatch fail-closed
      const badTenant = await decryptFieldValue(
        envelope,
        { ...CTX, tenantId: "evil_tenant" },
        "secretField",
      );
      expect(badTenant).toBeNull();

      // Tampered envelope fail-closed
      const tampered = envelope.slice(0, -4) + "AAAA";
      expect(await decryptFieldValue(tampered, CTX, "secretField")).toBeNull();
    });

    it("round-trips document fields through hybrid envelopes", async () => {
      const { generateKemKeyPair, isMlKemAvailable, isHybridEnvelope } =
        await import("@utils/security/hybrid-kem");
      if (!(await isMlKemAvailable())) return;

      const keys = await generateKemKeyPair();
      vi.stubEnv("PQC_HYBRID_FIELDS", "true");
      vi.stubEnv("KEM_PUBLIC_KEY", keys.publicKey);
      vi.stubEnv("KEM_PRIVATE_KEY", keys.privateKey);

      const doc = {
        name: "Alice",
        secretToken: "pqc_token_789",
      };

      await encryptDocumentFields(doc, ["secretToken"], CTX);
      expect(isHybridEnvelope(doc.secretToken)).toBe(true);

      await decryptDocumentFields(doc, ["secretToken"], CTX);
      expect(doc.secretToken).toBe("pqc_token_789");
    });
  });
});
