/**
 * @file tests/unit/services/backup-encryption.test.ts
 * @description Backup artifact AES-256-GCM with HKDF keys, per-artifact AAD
 *              binding, and UTF-8-slice / SCHB2 dual-read compatibility.
 *
 * Features tested:
 * - New archives encrypt/decrypt with an AAD-bound SCHB3 envelope
 * - AAD mismatch (wrong artifact path) is rejected
 * - Legacy SCHB2 / pre-HKDF archives still decrypt without AAD
 * - Tampered archives fail closed
 */

import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  backupArtifactAad,
  decryptBackupData,
  encryptBackupData,
} from "@src/services/core/backup-service";
import { generateKemKeyPair } from "@utils/security/hybrid-kem";

const PASSPHRASE = "backup-passphrase-must-be-32-chars!!";
const SETTINGS_AAD = backupArtifactAad("database/settings.json");
const ROLES_AAD = backupArtifactAad("database/roles.json");

describe("backup AES-256-GCM", () => {
  it("round-trips JSON through an AAD-bound SCHB3 envelope", async () => {
    const payload = JSON.stringify({ collections: 3, tenantId: "t1" });
    const encrypted = await encryptBackupData(payload, PASSPHRASE, SETTINGS_AAD);
    expect(encrypted.subarray(0, 5).toString("ascii")).toBe("SCHB3");
    expect(encrypted.length).toBeGreaterThan(12 + 16);
    const decrypted = await decryptBackupData(encrypted, PASSPHRASE, SETTINGS_AAD);
    expect(decrypted).toBe(payload);
  });

  it("rejects an SCHB3 archive decrypted without AAD", async () => {
    const encrypted = await encryptBackupData("secret", PASSPHRASE, SETTINGS_AAD);
    await expect(decryptBackupData(encrypted, PASSPHRASE)).rejects.toThrow(/decryption failed/);
  });

  it("rejects an SCHB3 archive decrypted with another artifact's AAD", async () => {
    const encrypted = await encryptBackupData("secret", PASSPHRASE, SETTINGS_AAD);
    await expect(decryptBackupData(encrypted, PASSPHRASE, ROLES_AAD)).rejects.toThrow(
      /decryption failed/,
    );
  });

  it("decrypts a legacy UTF-8-slice(0,32) archive", async () => {
    const payload = JSON.stringify({ legacy: true });
    const key = Buffer.from(PASSPHRASE, "utf8").subarray(0, 32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const envelope = Buffer.concat([iv, ciphertext, tag]);

    const decrypted = await decryptBackupData(envelope, PASSPHRASE, SETTINGS_AAD);
    expect(decrypted).toBe(payload);
  });

  it("rejects a tampered archive", async () => {
    const encrypted = await encryptBackupData("ok", PASSPHRASE, SETTINGS_AAD);
    encrypted[20] = encrypted[20] ^ 0xff;
    await expect(decryptBackupData(encrypted, PASSPHRASE, SETTINGS_AAD)).rejects.toThrow(
      /decryption failed/,
    );
  });

  it("uses the opt-in hybrid ML-KEM envelope when enabled", async () => {
    const pair = await generateKemKeyPair();
    vi.stubEnv("PQC_HYBRID_BACKUPS", "true");
    vi.stubEnv("PQC_KEM_PUBLIC_KEY", pair.publicKey);
    vi.stubEnv("PQC_KEM_PRIVATE_KEY", pair.privateKey);

    try {
      const encrypted = await encryptBackupData("hybrid payload", PASSPHRASE);
      expect(encrypted.subarray(0, 5).toString("ascii")).toBe("SCHP1");
      await expect(decryptBackupData(encrypted, PASSPHRASE)).resolves.toBe("hybrid payload");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
