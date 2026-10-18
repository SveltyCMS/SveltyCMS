/**
 * @file tests/unit/databases/two-factor-auth-service.test.ts
 * @description Real 2FA service behaviour (no mocked TOTP/crypto helpers).
 *
 * The existing `auth-2fa` API suite mocked this module away, so the real
 * AES-256-GCM at-rest envelope, backup-code hashing, TOTP replay registry and
 * trusted-device policy were never exercised. Only the database adapter is
 * faked here — every security helper runs for real.
 *
 * ### Features:
 * - setup creates an encrypted pending secret + 10 backup codes
 * - resumed setup re-uses the pending secret and never re-reveals codes
 * - completion promotes pending → enabled and stores hashes, not plaintext
 * - TOTP verify succeeds once, then the replay registry rejects the reuse
 * - backup code verify consumes the code
 * - trusted-device cap, role mfaRequired override, fail-closed role lookup
 * - disable / regenerate / status
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TwoFactorAuthService } from "@src/databases/auth/two-factor-auth";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTOTPSecret,
  getCurrentTOTPCode,
  hashBackupCode,
  isValidTOTPSecret,
  resetTotpEncryptionKeyCache,
  verifyBackupCode,
  verifyTrustedDeviceToken,
} from "@src/databases/auth/totp";
import { resetTotpReplayRegistry } from "@src/databases/auth/totp-replay-registry";

const USER_ID = "user-1" as DatabaseId;
const ENCRYPTION_KEY = "0123456789abcdef".repeat(4); // 64 hex chars = 32 bytes
const PLAIN_BACKUP_CODES = ["AAAA1111BBBB2222", "CCCC3333DDDD4444"];

interface FakeAuth {
  auth: IDBAdapter["auth"];
  users: Map<string, Record<string, any>>;
  spies: {
    getUserById: ReturnType<typeof vi.fn>;
    updateUserAttributes: ReturnType<typeof vi.fn>;
    getRoleById: ReturnType<typeof vi.fn>;
  };
}

function createFakeAuth(overrides: Record<string, any> = {}): FakeAuth {
  const users = new Map<string, Record<string, any>>([
    [
      USER_ID,
      {
        _id: USER_ID,
        username: "developer",
        email: "developer@test.com",
        role: "developer",
        is2FAEnabled: false,
        ...overrides,
      },
    ],
  ]);

  const getUserById = vi.fn(async (id: string) => {
    const user = users.get(id);
    return user
      ? { success: true, data: user }
      : { success: false, error: { message: "User not found" } };
  });

  const updateUserAttributes = vi.fn(async (id: string, patch: Record<string, unknown>) => {
    const user = users.get(id);
    if (!user) return { success: false, error: { message: "User not found" } };
    Object.assign(user, patch);
    return { success: true };
  });

  const getRoleById = vi.fn(async (id: string) => ({
    success: true,
    data: { _id: id, mfaRequired: false },
  }));

  return {
    auth: {
      getUserById,
      updateUserAttributes,
      getRoleById,
    } as unknown as IDBAdapter["auth"],
    users,
    spies: { getUserById, updateUserAttributes, getRoleById },
  };
}

function serviceFor(fake: FakeAuth): TwoFactorAuthService {
  return new TwoFactorAuthService(fake.auth);
}

describe("TwoFactorAuthService (real crypto + registry)", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
    // Backup-code HMAC secret comes from the settings service (JWT_SECRET_KEY).
    (globalThis as any).privateEnv = {
      JWT_SECRET_KEY: "unit-test-jwt-secret-key-0123456789abcdef",
    };
    resetTotpEncryptionKeyCache();
    resetTotpReplayRegistry();
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
    (globalThis as any).privateEnv = undefined;
    resetTotpEncryptionKeyCache();
    resetTotpReplayRegistry();
  });

  describe("initiate2FASetup", () => {
    it("creates a pending secret, encrypts it at rest, and returns 10 backup codes", async () => {
      const fake = createFakeAuth();
      const result = await serviceFor(fake).initiate2FASetup(
        USER_ID,
        "developer@test.com",
        "t1" as DatabaseId,
      );

      expect(result.pending).toBe(true);
      expect(result.backupCodes).toHaveLength(10);
      expect(isValidTOTPSecret(result.secret)).toBe(true);
      expect(result.qrCodeURL).toContain("otpauth://totp/");
      expect(result.manualEntryDetails.secret).toBe(result.secret);

      const stored = fake.users.get(USER_ID)!;
      expect(stored.twoFactorPending).toBe(true);
      expect(stored.is2FAEnabled).toBe(false);
      expect(stored.totpSecret).not.toBe(result.secret);
      expect(await decryptTotpSecret(stored.totpSecret)).toBe(result.secret);
      expect(fake.spies.updateUserAttributes).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ twoFactorPending: true, is2FAEnabled: false }),
        { tenantId: "t1" },
      );
    });

    it("resumes a pending setup without re-revealing backup codes", async () => {
      const secret = await generateTOTPSecret();
      const fake = createFakeAuth({
        twoFactorPending: true,
        totpSecret: await encryptTotpSecret(secret),
      });

      const result = await serviceFor(fake).initiate2FASetup(USER_ID, "developer@test.com");

      expect(result.secret).toBe(secret);
      expect(result.backupCodes).toEqual([]);
      expect(result.pending).toBe(true);
      expect(fake.spies.updateUserAttributes).not.toHaveBeenCalled();
    });
  });

  describe("complete2FASetup", () => {
    it("enables 2FA, clears pending, and stores only hashed backup codes", async () => {
      const secret = await generateTOTPSecret();
      const code = await getCurrentTOTPCode(secret);
      const fake = createFakeAuth();

      const ok = await serviceFor(fake).complete2FASetup(USER_ID, secret, code, PLAIN_BACKUP_CODES);

      expect(ok).toBe(true);
      const stored = fake.users.get(USER_ID)!;
      expect(stored.is2FAEnabled).toBe(true);
      expect(stored.twoFactorPending).toBe(false);
      expect(stored.backupCodes).toHaveLength(2);
      for (const plain of PLAIN_BACKUP_CODES) {
        expect(stored.backupCodes).not.toContain(plain);
        expect(
          await verifyBackupCode(plain, stored.backupCodes[PLAIN_BACKUP_CODES.indexOf(plain)]),
        ).toBe(true);
      }
      expect(stored.last2FAVerification).toBeTruthy();
    });

    it("falls back to the stored pending secret when the caller omits it", async () => {
      const secret = await generateTOTPSecret();
      const fake = createFakeAuth({
        twoFactorPending: true,
        totpSecret: await encryptTotpSecret(secret),
      });

      const ok = await serviceFor(fake).complete2FASetup(
        USER_ID,
        "",
        await getCurrentTOTPCode(secret),
        [],
      );

      expect(ok).toBe(true);
    });

    it("returns false for a wrong code without enabling 2FA", async () => {
      const secret = await generateTOTPSecret();
      const fake = createFakeAuth();

      const ok = await serviceFor(fake).complete2FASetup(USER_ID, secret, "000000", []);

      expect(ok).toBe(false);
      expect(fake.users.get(USER_ID)!.is2FAEnabled).toBe(false);
    });

    it("rejects an invalid secret with no pending fallback", async () => {
      const fake = createFakeAuth();
      await expect(
        serviceFor(fake).complete2FASetup(USER_ID, "not-base32!", "123456", []),
      ).rejects.toThrow(/Invalid TOTP secret/);
    });
  });

  describe("verify2FA", () => {
    it("accepts a TOTP code once and blocks replay", async () => {
      const secret = await generateTOTPSecret();
      const fake = createFakeAuth({
        is2FAEnabled: true,
        totpSecret: await encryptTotpSecret(secret),
      });
      const service = serviceFor(fake);
      const code = await getCurrentTOTPCode(secret);

      const first = await service.verify2FA(USER_ID, code);
      expect(first.success).toBe(true);
      expect(first.method).toBe("totp");

      const replay = await service.verify2FA(USER_ID, code);
      expect(replay.success).toBe(false);
      expect(replay.message).toBe("Invalid or expired code");
    });

    it("returns a signed trusted-device token when a fingerprint is supplied", async () => {
      const secret = await generateTOTPSecret();
      const fake = createFakeAuth({
        is2FAEnabled: true,
        totpSecret: await encryptTotpSecret(secret),
      });

      const result = await serviceFor(fake).verify2FA(
        USER_ID,
        await getCurrentTOTPCode(secret),
        null,
        "device-fp",
      );

      expect(result.success).toBe(true);
      expect(result.trustedDeviceToken).toBeTruthy();
      expect(await verifyTrustedDeviceToken(result.trustedDeviceToken!, "device-fp")).toBe(USER_ID);
    });

    it("accepts a backup code and removes it from the stored set", async () => {
      const plain = "EEEE5555FFFF6666";
      const hashed = await hashBackupCode(plain);
      const fake = createFakeAuth({
        is2FAEnabled: true,
        totpSecret: await encryptTotpSecret(await generateTOTPSecret()),
        backupCodes: [hashed],
      });

      const result = await serviceFor(fake).verify2FA(USER_ID, plain);

      expect(result.success).toBe(true);
      expect(result.method).toBe("backup");
      expect(result.backupCodeUsed).toBe(true);
      expect(fake.users.get(USER_ID)!.backupCodes).toEqual([]);
    });

    it("rejects unknown users, disabled 2FA, and invalid codes", async () => {
      const missing = serviceFor(createFakeAuth());
      expect(await missing.verify2FA("nobody" as DatabaseId, "123456")).toEqual({
        success: false,
        message: "User not found",
      });

      const disabled = serviceFor(createFakeAuth());
      expect(await disabled.verify2FA(USER_ID, "123456")).toEqual({
        success: false,
        message: "2FA is not enabled for this user",
      });

      const enabled = serviceFor(
        createFakeAuth({
          is2FAEnabled: true,
          totpSecret: await encryptTotpSecret(await generateTOTPSecret()),
        }),
      );
      expect(await enabled.verify2FA(USER_ID, "000000")).toEqual({
        success: false,
        message: "Invalid 2FA code",
      });
    });
  });

  describe("trusted devices", () => {
    it("matches a stored device fingerprint", async () => {
      const fake = createFakeAuth({ twoFactorTrustedDevices: ["fp-1", "fp-2"] });
      const service = serviceFor(fake);

      expect(await service.hasTrustedDevice(USER_ID, "fp-1")).toBe(true);
      expect(await service.hasTrustedDevice(USER_ID, "other")).toBe(false);
    });

    it("refuses the bypass when the role mandates MFA", async () => {
      const fake = createFakeAuth({ twoFactorTrustedDevices: ["fp-1"] });
      fake.spies.getRoleById.mockResolvedValueOnce({
        success: true,
        data: { _id: "developer", mfaRequired: true },
      });

      expect(await serviceFor(fake).hasTrustedDevice(USER_ID, "fp-1")).toBe(false);
    });

    it("fails closed when the role lookup throws", async () => {
      const fake = createFakeAuth({ twoFactorTrustedDevices: ["fp-1"] });
      fake.spies.getRoleById.mockRejectedValueOnce(new Error("role store down"));

      expect(await serviceFor(fake).hasTrustedDevice(USER_ID, "fp-1")).toBe(false);
    });

    it("keeps at most five devices and de-duplicates", async () => {
      const fake = createFakeAuth({ twoFactorTrustedDevices: ["fp-1", "fp-2"] });
      const service = serviceFor(fake);

      for (const fp of ["fp-1", "fp-3", "fp-4", "fp-5", "fp-6", "fp-7"]) {
        await service.addTrustedDevice(USER_ID, fp);
      }

      const devices = fake.users.get(USER_ID)!.twoFactorTrustedDevices as string[];
      expect(devices).toHaveLength(5);
      expect(devices[devices.length - 1]).toBe("fp-7");
      expect(devices).not.toContain("fp-1");
      expect(new Set(devices).size).toBe(devices.length);
    });
  });

  describe("disable / regenerate / status", () => {
    it("clears every 2FA field on disable", async () => {
      const fake = createFakeAuth({
        is2FAEnabled: true,
        twoFactorPending: false,
        totpSecret: "enc",
        backupCodes: ["hash"],
        last2FAVerification: "2026-10-18T00:00:00.000Z",
        twoFactorTrustedDevices: ["fp"],
      });

      expect(await serviceFor(fake).disable2FA(USER_ID)).toBe(true);
      const stored = fake.users.get(USER_ID)!;
      expect(stored.is2FAEnabled).toBe(false);
      expect(stored.twoFactorPending).toBe(false);
      expect(stored.totpSecret).toBeUndefined();
      expect(stored.backupCodes).toBeUndefined();
      expect(stored.last2FAVerification).toBeUndefined();
      expect(stored.twoFactorTrustedDevices).toBeUndefined();
    });

    it("regenerates 10 hashed codes and rejects when 2FA is off", async () => {
      const enabled = createFakeAuth({ is2FAEnabled: true, backupCodes: ["old"] });
      const codes = await serviceFor(enabled).regenerateBackupCodes(USER_ID);

      expect(codes).toHaveLength(10);
      const stored = enabled.users.get(USER_ID)!.backupCodes as string[];
      expect(stored).toHaveLength(10);
      expect(stored).not.toContain("old");
      expect(await verifyBackupCode(codes[0], stored[0])).toBe(true);

      const disabled = serviceFor(createFakeAuth());
      await expect(disabled.regenerateBackupCodes(USER_ID)).rejects.toThrow(/2FA is not enabled/);
    });

    it("reports the current 2FA status", async () => {
      const fake = createFakeAuth({
        is2FAEnabled: true,
        twoFactorPending: false,
        backupCodes: ["a", "b"],
        last2FAVerification: "2026-10-18T00:00:00.000Z",
        twoFactorTrustedDevices: ["fp-1"],
      });

      expect(await serviceFor(fake).get2FAStatus(USER_ID)).toEqual({
        enabled: true,
        pending: false,
        hasBackupCodes: true,
        backupCodesCount: 2,
        lastVerification: "2026-10-18T00:00:00.000Z",
        trustedDevicesCount: 1,
      });
    });

    it("rejects status for an unknown user", async () => {
      await expect(
        serviceFor(createFakeAuth()).get2FAStatus("missing" as DatabaseId),
      ).rejects.toThrow(/User not found/);
    });
  });
});
