/**
 * @file src/databases/auth/twoFactorAuthTypes.ts
 * @description Type definitions for Two-Factor Authentication
 *
 * This file contains only type definitions and interfaces for 2FA
 * to avoid importing server-side dependencies in client code.
 *
 * Types:
 * - TwoFactorSetupResponse: Response structure for 2FA setup
 * - TwoFactorVerificationResult: Result structure for 2FA verification
 *
 * These types are used in both server and client code to ensure
 * consistent data structures without importing server-only logic.
 */

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
	qrCodeURL: string;
	secret: string;
}

// 2FA Verification Result Interface
export interface TwoFactorVerificationResult {
	backupCodeUsed?: boolean;
	message: string;
	method?: 'totp' | 'backup';
	success: boolean;
}
