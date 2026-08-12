/**
 * @file src/databases/auth/two-factor-auth.ts
 * @description Two-Factor Authentication service layer
 *
 * This module provides high-level 2FA operations that integrate with the auth system.
 * It handles user 2FA setup, verification, backup codes, trusted devices, and recovery.
 *
 * Features:
 * - Setup and enable 2FA for users (with pending state for interrupted setup)
 * - AES-256-GCM encryption of TOTP secrets at rest (backward compatible)
 * - Verify 2FA codes during login (TOTP + backup codes)
 * - Trusted device support ("Remember this device" — 30-day skip)
 * - Generate and manage backup codes
 * - Disable 2FA with proper verification
 * - Multi-tenant aware operations
 */

import type { DatabaseId, IDBAdapter, ISODateString } from "@src/databases/db-interface";
// System Logger
import { logger } from "@utils/logger";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateManualEntryDetails,
  generateQRCodeURL,
  generateTOTPSecret,
  generateTrustedDeviceToken,
  hashBackupCode,
  isValidTOTPSecret,
  verifyBackupCode,
  verifyTOTPCode,
} from "./totp";
import { getTotpReplayRegistry } from "./totp-replay-registry";
import type { User } from "./types";

// Type for the auth interface extracted from IDBAdapter
type AuthInterface = IDBAdapter["auth"];

// ─── Helper: Decrypt stored TOTP secret (handles legacy plaintext + encrypted) ─

async function resolveTotpSecret(totpSecret: string | undefined): Promise<string | null> {
  if (!totpSecret) return null;
  return decryptTotpSecret(totpSecret);
}

// ─── Two-Factor Authentication Service ───────────────────────────────────────

export class TwoFactorAuthService {
  private readonly db: AuthInterface;
  private readonly serviceName: string;

  constructor(db: AuthInterface, serviceName = "SveltyCMS") {
    this.db = db;
    this.serviceName = serviceName;
  }

  /**
   * Initialize 2FA setup for a user.
   * Generates a new secret and backup codes. The encrypted secret is persisted
   * immediately with `twoFactorPending: true` so setup can be resumed after
   * a page refresh or browser close.
   */
  async initiate2FASetup(
    userId: DatabaseId,
    userEmail: string,
    tenantId?: DatabaseId | null,
  ): Promise<TwoFactorSetupResponse> {
    try {
      logger.info("Initiating 2FA setup", { userId, tenantId });

      // Check for existing pending setup — if found, resume it
      const existingUser = await this.db.getUserById(userId, {
        tenantId: tenantId ?? undefined,
      });
      if (
        existingUser.success &&
        existingUser.data?.twoFactorPending &&
        existingUser.data?.totpSecret
      ) {
        const existingSecret = await resolveTotpSecret(existingUser.data.totpSecret);
        if (existingSecret) {
          logger.info("Resuming pending 2FA setup", { userId, tenantId });
          const qrCodeURL = generateQRCodeURL(existingSecret, userEmail, this.serviceName);
          const manualEntryDetails = generateManualEntryDetails(
            existingSecret,
            userEmail,
            this.serviceName,
          );
          return {
            secret: existingSecret,
            qrCodeURL,
            manualEntryDetails,
            backupCodes: [], // Re-vealing backup codes from a pending setup isn't safe
            pending: true,
          };
        }
      }

      // Generate new TOTP secret
      const secret = await generateTOTPSecret();

      // Encrypt secret for at-rest storage before persisting as pending
      const encryptedSecret = await encryptTotpSecret(secret);

      // Persist the encrypted secret immediately as pending (enables resume)
      await this.db.updateUserAttributes(
        userId,
        {
          totpSecret: encryptedSecret,
          twoFactorPending: true,
          is2FAEnabled: false,
        },
        { tenantId: tenantId ?? undefined },
      );

      // Generate QR code URL for authenticator apps
      const qrCodeURL = generateQRCodeURL(secret, userEmail, this.serviceName);

      // Generate manual entry details for apps that don't support QR codes
      const manualEntryDetails = generateManualEntryDetails(secret, userEmail, this.serviceName);

      // Generate backup codes — NOT persisted yet (only after verification)
      const backupCodes = await generateBackupCodes(10);

      const response: TwoFactorSetupResponse = {
        secret,
        qrCodeURL,
        manualEntryDetails,
        backupCodes: [...backupCodes], // Return plain codes to user
        pending: true,
      };

      logger.info("2FA setup initiated (pending)", { userId, tenantId });
      return response;
    } catch (error: any) {
      const message = `Failed to initiate 2FA setup: ${error.message}`;
      logger.error(message, { userId, tenantId });
      throw new Error(message);
    }
  }

  /**
   * Complete 2FA setup by verifying the first TOTP code.
   * Promotes the pending secret to active and enables 2FA.
   *
   * The `secret` parameter can be either:
   * - The plaintext secret returned during initiate2FASetup (in-session)
   * - Omitted to read from the stored pending secret (resumed setup)
   */
  async complete2FASetup(
    userId: DatabaseId,
    secret: string,
    verificationCode: string,
    backupCodes: string[],
    tenantId?: DatabaseId | null,
  ): Promise<boolean> {
    try {
      logger.info("Completing 2FA setup", { userId, tenantId });

      // Validate the provided secret or fall back to stored pending secret
      let resolvedSecret: string | null = null;

      if (secret && isValidTOTPSecret(secret)) {
        resolvedSecret = secret;
      } else {
        // Attempt to read the stored pending secret (resumed setup)
        const userResult = await this.db.getUserById(userId, {
          tenantId: tenantId ?? undefined,
        });
        if (userResult.success && userResult.data?.totpSecret) {
          resolvedSecret = await resolveTotpSecret(userResult.data.totpSecret);
        }
      }

      if (!resolvedSecret || !isValidTOTPSecret(resolvedSecret)) {
        throw new Error("Invalid TOTP secret format");
      }

      // Verify the TOTP code
      if (!(await verifyTOTPCode(resolvedSecret, verificationCode))) {
        logger.warn("2FA setup failed - invalid verification code", {
          userId,
          tenantId,
        });
        return false;
      }

      // Hash backup codes for secure storage
      const hashedBackupCodes = await Promise.all(backupCodes.map((code) => hashBackupCode(code)));

      // Re-encrypt the secret (in case the stored one has a different envelope)
      const encryptedSecret = await encryptTotpSecret(resolvedSecret);

      // Update user with 2FA settings — promote from pending to active
      const updateData: Partial<User> = {
        is2FAEnabled: true,
        twoFactorPending: false,
        totpSecret: encryptedSecret,
        backupCodes: hashedBackupCodes,
        last2FAVerification: new Date().toISOString() as ISODateString,
      };

      const result = await this.db.updateUserAttributes(userId, updateData, {
        tenantId: tenantId ?? undefined,
      });
      if (!result.success) {
        throw new Error("Failed to update user 2FA settings");
      }

      logger.info("2FA setup completed successfully", { userId, tenantId });
      return true;
    } catch (error: any) {
      const message = `Failed to complete 2FA setup: ${error.message}`;
      // Validation failures are expected during testing — log as warn
      if (
        error.message.includes("Invalid TOTP secret") ||
        error.message.includes("Invalid verification")
      ) {
        logger.warn(message, { userId, tenantId });
      } else {
        logger.error(message, { userId, tenantId });
      }
      throw new Error(message);
    }
  }

  /**
   * Verify 2FA code during authentication.
   * Supports both TOTP codes and backup codes.
   * Also accepts a `deviceFingerprint` for trusted-device token generation.
   */
  async verify2FA(
    userId: DatabaseId,
    code: string,
    tenantId?: DatabaseId | null,
    deviceFingerprint?: string,
  ): Promise<TwoFactorVerificationResult & { trustedDeviceToken?: string }> {
    try {
      logger.debug("Verifying 2FA code", { userId, tenantId });

      // Get user data
      const userResult = await this.db.getUserById(userId, {
        tenantId: tenantId ?? undefined,
      });
      if (!(userResult.success && userResult.data)) {
        return {
          success: false,
          message: "User not found",
        };
      }

      const user = userResult.data;

      // Check if 2FA is enabled
      if (!user.is2FAEnabled) {
        return {
          success: false,
          message: "2FA is not enabled for this user",
        };
      }

      // Resolve the stored TOTP secret (decrypt if encrypted, handle legacy plaintext)
      const resolvedSecret = await resolveTotpSecret(user.totpSecret);

      // First try TOTP verification
      if (resolvedSecret && (await verifyTOTPCode(resolvedSecret, code))) {
        // --- TOTP Replay Protection ---
        // After math validation passes, check the consumed-codes registry.
        // This prevents an attacker from replaying an intercepted code within
        // the 90-second validity window (30s TOTP + ±30s clock skew).
        const registry = getTotpReplayRegistry();
        const isFirstUse = await registry.consumeCode(String(userId), code);
        if (!isFirstUse) {
          logger.warn("TOTP replay attack blocked", { userId });
          return {
            success: false,
            message: "Invalid or expired code",
          };
        }

        // Generate trusted device token if requested
        let trustedDeviceToken: string | undefined;
        if (deviceFingerprint) {
          trustedDeviceToken =
            (await generateTrustedDeviceToken(String(userId), deviceFingerprint)) ?? undefined;
        }

        // Update last verification time
        await this.db.updateUserAttributes(
          userId,
          {
            last2FAVerification: new Date().toISOString() as ISODateString,
          },
          { tenantId: tenantId ?? undefined },
        );

        logger.info("2FA verification successful via TOTP", {
          userId,
          tenantId,
          hasTrustedDevice: !!trustedDeviceToken,
        });
        return {
          success: true,
          method: "totp",
          message: "2FA verification successful",
          trustedDeviceToken,
        };
      }

      // Try backup code verification
      if (user.backupCodes && user.backupCodes.length > 0) {
        for (let i = 0; i < user.backupCodes.length; i++) {
          const hashedCode = user.backupCodes[i];
          if (await verifyBackupCode(code, hashedCode)) {
            // Remove used backup code
            const updatedBackupCodes = [...user.backupCodes];
            updatedBackupCodes.splice(i, 1);

            // Update user with remaining backup codes
            await this.db.updateUserAttributes(
              userId,
              {
                backupCodes: updatedBackupCodes,
                last2FAVerification: new Date().toISOString() as ISODateString,
              },
              { tenantId },
            );

            logger.info("2FA verification successful via backup code", {
              userId,
              tenantId,
              remainingBackupCodes: updatedBackupCodes.length,
            });

            return {
              success: true,
              method: "backup",
              message: `2FA verification successful using backup code. ${updatedBackupCodes.length} backup codes remaining.`,
              backupCodeUsed: true,
            };
          }
        }
      }

      logger.warn("2FA verification failed", { userId, tenantId });
      return {
        success: false,
        message: "Invalid 2FA code",
      };
    } catch (error: any) {
      const message = `2FA verification error: ${error.message}`;
      logger.error(message, { userId, tenantId });
      return {
        success: false,
        message: "2FA verification failed due to system error",
      };
    }
  }

  /**
   * Check if a user has a valid trusted-device token.
   * Returns true if 2FA can be skipped for this session.
   */
  async hasTrustedDevice(
    userId: DatabaseId,
    deviceFingerprint: string,
    tenantId?: DatabaseId | null,
  ): Promise<boolean> {
    try {
      const userResult = await this.db.getUserById(userId, {
        tenantId: tenantId ?? undefined,
      });
      if (!(userResult.success && userResult.data)) return false;

      const user = userResult.data;
      const trustedDevices = user.twoFactorTrustedDevices || [];
      if (trustedDevices.length === 0) return false;

      // Check if the device fingerprint matches a stored device
      return trustedDevices.includes(deviceFingerprint);
    } catch {
      return false;
    }
  }

  /**
   * Add a trusted device fingerprint to the user's trusted devices list.
   * Maintains a maximum of 5 trusted devices (FIFO eviction).
   */
  async addTrustedDevice(
    userId: DatabaseId,
    deviceFingerprint: string,
    tenantId?: DatabaseId | null,
  ): Promise<void> {
    try {
      const userResult = await this.db.getUserById(userId, {
        tenantId: tenantId ?? undefined,
      });
      if (!(userResult.success && userResult.data)) return;

      const user = userResult.data;
      const trustedDevices = user.twoFactorTrustedDevices || [];

      // Remove existing duplicate if present
      const idx = trustedDevices.indexOf(deviceFingerprint);
      if (idx > -1) trustedDevices.splice(idx, 1);

      // Add new device, evict oldest if > 5
      trustedDevices.push(deviceFingerprint);
      if (trustedDevices.length > 5) trustedDevices.shift();

      await this.db.updateUserAttributes(
        userId,
        { twoFactorTrustedDevices: trustedDevices },
        { tenantId: tenantId ?? undefined },
      );

      logger.debug("Trusted device added", { userId, deviceCount: trustedDevices.length });
    } catch (err: any) {
      logger.warn("Failed to add trusted device", { userId, error: err.message });
    }
  }

  // Disable 2FA for a user (requires current password or admin permission)
  async disable2FA(userId: DatabaseId, tenantId?: DatabaseId | null): Promise<boolean> {
    try {
      logger.info("Disabling 2FA", { userId, tenantId });

      // Update user to disable 2FA and clear secrets
      const updateData: Partial<User> = {
        is2FAEnabled: false,
        twoFactorPending: false,
        totpSecret: undefined,
        backupCodes: undefined,
        last2FAVerification: undefined,
        twoFactorTrustedDevices: undefined,
      };

      const result = await this.db.updateUserAttributes(userId, updateData, {
        tenantId: tenantId ?? undefined,
      });

      if (!result.success) {
        throw new Error("Failed to disable 2FA");
      }

      logger.info("2FA disabled successfully", { userId, tenantId });
      return true;
    } catch (error: any) {
      const message = `Failed to disable 2FA: ${error.message}`;
      if (error.message.includes("2FA is not enabled")) {
        logger.warn(message, { userId, tenantId });
      } else {
        logger.error(message, { userId, tenantId });
      }
      throw new Error(message);
    }
  }

  // Generate new backup codes for a user (invalidates old ones)
  async regenerateBackupCodes(userId: DatabaseId, tenantId?: DatabaseId | null): Promise<string[]> {
    try {
      logger.info("Regenerating backup codes", { userId, tenantId });

      // Get user to verify 2FA is enabled
      const userResult = await this.db.getUserById(userId, {
        tenantId: tenantId ?? undefined,
      });
      if (!(userResult.success && userResult.data && userResult.data.is2FAEnabled)) {
        throw new Error("2FA is not enabled for this user");
      }

      // Generate new backup codes
      const newBackupCodes = await generateBackupCodes(10);
      const hashedBackupCodes = await Promise.all(
        newBackupCodes.map((code) => hashBackupCode(code)),
      );

      // Update user with new backup codes
      const result = await this.db.updateUserAttributes(
        userId,
        {
          backupCodes: hashedBackupCodes,
        },
        { tenantId: tenantId ?? undefined },
      );

      if (!result.success) {
        throw new Error("Failed to update backup codes");
      }

      logger.info("Backup codes regenerated successfully", {
        userId,
        tenantId,
      });
      return newBackupCodes; // Return plain codes to user
    } catch (error: any) {
      const message = `Failed to regenerate backup codes: ${error.message}`;
      if (error.message.includes("2FA is not enabled")) {
        logger.warn(message, { userId, tenantId });
      } else {
        logger.error(message, { userId, tenantId });
      }
      throw new Error(message);
    }
  }

  // Get 2FA status for a user
  async get2FAStatus(
    userId: DatabaseId,
    tenantId?: DatabaseId | null,
  ): Promise<{
    enabled: boolean;
    pending: boolean;
    hasBackupCodes: boolean;
    backupCodesCount: number;
    lastVerification?: ISODateString;
    trustedDevicesCount: number;
  }> {
    try {
      const userResult = await this.db.getUserById(userId, {
        tenantId: tenantId ?? undefined,
      });
      if (!(userResult.success && userResult.data)) {
        throw new Error("User not found");
      }

      const user = userResult.data;

      return {
        enabled: Boolean(user.is2FAEnabled),
        pending: Boolean(user.twoFactorPending),
        hasBackupCodes: Boolean(user.backupCodes && user.backupCodes.length > 0),
        backupCodesCount: user.backupCodes ? user.backupCodes.length : 0,
        lastVerification: user.last2FAVerification,
        trustedDevicesCount: user.twoFactorTrustedDevices?.length || 0,
      };
    } catch (error: any) {
      const message = `Failed to get 2FA status: ${error.message}`;
      logger.error(message, { userId, tenantId });
      throw new Error(message);
    }
  }
}

// Create a singleton instance for the default auth database
let defaultTwoFactorService: TwoFactorAuthService | null = null;

export function createTwoFactorAuthService(
  db: AuthInterface,
  serviceName?: string,
): TwoFactorAuthService {
  return new TwoFactorAuthService(db, serviceName);
}

export function getDefaultTwoFactorAuthService(db: AuthInterface): TwoFactorAuthService {
  if (!defaultTwoFactorService) {
    defaultTwoFactorService = new TwoFactorAuthService(db);
  }
  return defaultTwoFactorService;
}

// ─── Types ────────────────────────────────────────────────────────────────

// 2FA Setup Response Interface
export interface TwoFactorSetupResponse {
  backupCodes: string[];
  manualEntryDetails: {
    secret: string;
    account: string;
    issuer: string;
    algorithm: string;
    digits: number;
    period: number;
  };
  /** True when setup is in progress but not yet verified. Secret is persisted encrypted. */
  pending?: boolean;
  qrCodeURL: string;
  secret: string;
}

// 2FA Verification Result Interface
export interface TwoFactorVerificationResult {
  backupCodeUsed?: boolean;
  message: string;
  method?: "totp" | "backup";
  success: boolean;
}
