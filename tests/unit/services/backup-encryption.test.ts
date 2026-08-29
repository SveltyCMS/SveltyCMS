/**
 * @file tests/unit/services/backup-encryption.test.ts
 * @description Backup artifact AES-256-GCM with HKDF keys and UTF-8-slice dual-read.
 *
 * Features tested:
 * - New archives encrypt/decrypt with HKDF-SHA-256
 * - Archives written with the pre-HKDF UTF-8 slice(0,32) key still decrypt
 */

import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptBackupData, encryptBackupData } from "@src/services/core/backup-service";

const PASSPHRASE = "backup-passphrase-must-be-32-chars!!";

describe("backup AES-256-GCM", () => {
  it("round-trips JSON through HKDF-derived AES-256-GCM", async () => {
    const payload = JSON.stringify({ collections: 3, tenantId: "t1" });
    const encrypted = await encryptBackupData(payload, PASSPHRASE);
    expect(encrypted.length).toBeGreaterThan(12 + 16);
    const decrypted = await decryptBackupData(encrypted, PASSPHRASE);
    expect(decrypted).toBe(payload);
  });

  it("decrypts a legacy UTF-8-slice(0,32) archive", async () => {
    const payload = JSON.stringify({ legacy: true });
    const key = Buffer.from(PASSPHRASE, "utf8").subarray(0, 32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const envelope = Buffer.concat([iv, ciphertext, tag]);

    const decrypted = await decryptBackupData(envelope, PASSPHRASE);
    expect(decrypted).toBe(payload);
  });

  it("rejects a tampered archive", async () => {
    const encrypted = await encryptBackupData("ok", PASSPHRASE);
    encrypted[20] = encrypted[20] ^ 0xff;
    await expect(decryptBackupData(encrypted, PASSPHRASE)).rejects.toThrow(/decryption failed/);
  });
});
