/**
 * @file tests/unit/security/key-ring.test.ts
 * @description Key-ID envelopes and rotation tests for the at-rest stores.
 *
 * Covers the v2 envelope contract (`v2:<keyId>:…` / binary key IDs / backup
 * magic), the configured decrypt ring, v1 backward compatibility, and the
 * fail-closed behavior for an unknown key ID.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { AES256_HKDF_INFO, AES256_HKDF_SALT } from "@utils/security/crypto";
import {
  deriveKeyId,
  keysForEnvelope,
  parseKeyRingJson,
  resolveKeyRing,
} from "@utils/security/envelope";

const OLD_KEY = "11".repeat(32);
const NEW_KEY = "22".repeat(32);
const OLD_ID = deriveKeyId(Buffer.from(OLD_KEY, "hex"), createHash);
const NEW_ID = deriveKeyId(Buffer.from(NEW_KEY, "hex"), createHash);
const FIELD_CTX = { collectionId: "posts", tenantId: "tenant-1" };
const PLUGIN_CTX = { tenantId: "tenant-1", pluginId: "plugin-1" };

function resetAllKeyCaches(mods: {
  field?: { resetFieldEncryptionKeyCache: () => void };
  settings?: { resetSettingsCryptoKeyCache: () => void };
  totp?: { resetTotpEncryptionKeyCache: () => void };
}): void {
  mods.field?.resetFieldEncryptionKeyCache();
  mods.settings?.resetSettingsCryptoKeyCache();
  mods.totp?.resetTotpEncryptionKeyCache();
}

const ALL_KEY_ENV_VARS = [
  "ENCRYPTION_KEY",
  "SECRET_ENCRYPTION_KEY",
  "ENCRYPTION_KEY_ID",
  "ENCRYPTION_KEY_RING",
  "SECRET_ENCRYPTION_KEY_ID",
  "SECRET_ENCRYPTION_KEY_RING",
  "BACKUP_KEY_ID",
  "BACKUP_KEY_RING",
];

function clearKeyEnv(): void {
  for (const key of ALL_KEY_ENV_VARS) delete process.env[key];
}

beforeEach(() => {
  vi.unstubAllEnvs();
  clearKeyEnv();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearKeyEnv();
  vi.resetModules();
});

describe("key-ring resolution", () => {
  it("derives a stable ID from the primary key", () => {
    const bytes = Buffer.from(OLD_KEY, "hex");
    expect(deriveKeyId(bytes, createHash)).toBe(OLD_ID);
    expect(deriveKeyId(bytes, createHash)).toBe(OLD_ID);
  });

  it("includes configured ring keys and deduplicates identical material", () => {
    const ring = resolveKeyRing({ hkdfSync, createHash }, OLD_KEY, "test-info", {
      keyId: "primary-1",
      ringJson: JSON.stringify({ "old-1": OLD_KEY, "backup-1": NEW_KEY }),
    });

    expect(ring.primaryId).toBe("primary-1");
    expect(ring.entries.map((entry) => entry.id)).toEqual(["primary-1", "backup-1"]);
    expect(ring.entries[0].key.equals(ring.entries[1].key)).toBe(false);
  });

  it("skips malformed ring entries instead of throwing", () => {
    expect(parseKeyRingJson("not json")).toEqual([]);
    expect(parseKeyRingJson('{"bad id!":"x","ok-1":"x","num":1}')).toEqual([
      { id: "ok-1", raw: "x" },
    ]);
  });

  it("selects exactly one key for v2 and every key for v1", () => {
    const ring = resolveKeyRing({ hkdfSync, createHash }, NEW_KEY, "test-info", {
      ringJson: JSON.stringify({ [OLD_ID]: OLD_KEY }),
    });

    expect(keysForEnvelope(ring, { version: 2, keyId: OLD_ID }).keys).toHaveLength(1);
    expect(keysForEnvelope(ring, { version: 2, keyId: "missing" })).toEqual({
      keys: [],
      unknownKeyId: true,
    });
    expect(keysForEnvelope(ring, { version: 1 }).keys.length).toBe(2);
  });
});

describe("field encryption key rotation", () => {
  it("writes v2 with the primary ID and decrypts old v2 through the ring", async () => {
    vi.stubEnv("ENCRYPTION_KEY", OLD_KEY);
    vi.stubEnv("SECRET_ENCRYPTION_KEY", "");
    vi.stubEnv("ENCRYPTION_KEY_ID", "");
    vi.stubEnv("ENCRYPTION_KEY_RING", "");

    const before = await import("@utils/security/field-encryption");
    resetAllKeyCaches({ field: before });
    const envelope = before.encryptFieldValueSync("ssn-123", FIELD_CTX, "ssn");

    expect(envelope.startsWith(`v2:${OLD_ID}:`)).toBe(true);
    expect(NEW_ID).not.toBe(OLD_ID);

    vi.stubEnv("ENCRYPTION_KEY", NEW_KEY);
    vi.stubEnv("ENCRYPTION_KEY_RING", JSON.stringify({ [OLD_ID]: OLD_KEY }));
    const after = await import("@utils/security/field-encryption");
    resetAllKeyCaches({ field: after });

    expect(after.decryptFieldValueSync(envelope, FIELD_CTX, "ssn")).toBe("ssn-123");
  });

  it("reads a legacy v1 envelope with the rotated ring", async () => {
    vi.stubEnv("ENCRYPTION_KEY", NEW_KEY);
    vi.stubEnv("ENCRYPTION_KEY_RING", JSON.stringify({ [OLD_ID]: OLD_KEY }));

    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(OLD_KEY, "hex"), iv);
    cipher.setAAD(Buffer.from("tenant-1:posts:ssn", "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify("legacy-value"), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const legacy = `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;

    const mod = await import("@utils/security/field-encryption");
    resetAllKeyCaches({ field: mod });

    expect(mod.decryptFieldValueSync(legacy, FIELD_CTX, "ssn")).toBe("legacy-value");
  });

  it("fails closed for an unknown key ID", async () => {
    vi.stubEnv("ENCRYPTION_KEY", OLD_KEY);
    vi.stubEnv("SECRET_ENCRYPTION_KEY", "");

    const mod = await import("@utils/security/field-encryption");
    resetAllKeyCaches({ field: mod });
    const envelope = mod.encryptFieldValueSync("value", FIELD_CTX, "ssn");
    const parts = envelope.split(":");
    const unknown = ["v2", "0000000000000000", ...parts.slice(2)].join(":");

    expect(mod.decryptFieldValueSync(unknown, FIELD_CTX, "ssn")).toBeNull();
  });
});

describe("plugin settings key rotation", () => {
  it("writes a v2 binary envelope and decrypts through the ring", async () => {
    vi.stubEnv("SECRET_ENCRYPTION_KEY", OLD_KEY);
    vi.stubEnv("SECRET_ENCRYPTION_KEY_ID", "");
    vi.stubEnv("SECRET_ENCRYPTION_KEY_RING", "");

    const before = await import("@src/plugins/settings-crypto");
    resetAllKeyCaches({ settings: before });
    const envelope = await before.encryptSecret("hunter2", PLUGIN_CTX);

    expect(envelope).not.toBeNull();
    expect(Buffer.from(envelope!, "base64")[0]).toBe(2);

    vi.stubEnv("SECRET_ENCRYPTION_KEY", NEW_KEY);
    vi.stubEnv("SECRET_ENCRYPTION_KEY_RING", JSON.stringify({ [OLD_ID]: OLD_KEY }));
    const after = await import("@src/plugins/settings-crypto");
    resetAllKeyCaches({ settings: after });

    await expect(after.decryptSecret(envelope!, PLUGIN_CTX)).resolves.toBe("hunter2");
  });
});

describe("TOTP key rotation", () => {
  it("writes a v2 binary envelope and decrypts through the ring", async () => {
    vi.stubEnv("ENCRYPTION_KEY", OLD_KEY);
    vi.stubEnv("SECRET_ENCRYPTION_KEY", "");
    vi.stubEnv("ENCRYPTION_KEY_ID", "");
    vi.stubEnv("ENCRYPTION_KEY_RING", "");

    const before = await import("@src/databases/auth/totp");
    resetAllKeyCaches({ totp: before });
    const envelope = await before.encryptTotpSecret("JBSWY3DPEHPK3PXP");

    expect(Buffer.from(envelope, "base64")[0]).toBe(2);

    vi.stubEnv("ENCRYPTION_KEY", NEW_KEY);
    vi.stubEnv("ENCRYPTION_KEY_RING", JSON.stringify({ [OLD_ID]: OLD_KEY }));
    const after = await import("@src/databases/auth/totp");
    resetAllKeyCaches({ totp: after });

    await expect(after.decryptTotpSecret(envelope)).resolves.toBe("JBSWY3DPEHPK3PXP");
  });
});

describe("backup key rotation", () => {
  it("writes the SCHB2 envelope and decrypts through the ring", async () => {
    const oldBackupPrimary = Buffer.from(
      hkdfSync("sha256", OLD_KEY, AES256_HKDF_SALT, AES256_HKDF_INFO.backupArtifact, 32),
    );
    const oldBackupId = deriveKeyId(oldBackupPrimary, createHash);

    vi.stubEnv("BACKUP_KEY_RING", "");
    const { encryptBackupData, decryptBackupData } =
      await import("@src/services/core/backup-service");
    const blob = await encryptBackupData("payload", OLD_KEY);

    expect(blob.subarray(0, 5).toString("ascii")).toBe("SCHB2");

    vi.stubEnv("BACKUP_KEY_RING", JSON.stringify({ [oldBackupId]: OLD_KEY }));
    await expect(decryptBackupData(blob, NEW_KEY)).resolves.toBe("payload");
  });
});
