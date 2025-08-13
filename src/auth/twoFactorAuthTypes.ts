/**
 * @file src/auth/twoFactorAuthTypes.ts
 * @description Type definitions for Two-Factor Authentication
 *
 * This file contains only type definitions and interfaces for 2FA
 * to avoid importing server-side dependencies in client code.
 */

// 2FA Setup Response Interface
export interface TwoFactorSetupResponse {
	secret: string;
	qrCodeURL: string;
	manualEntryDetails: {
		secret: string;
		account: string;
		issuer: string;
		algorithm: string;
		digits: number;
		period: number;
	};
	backupCodes: string[];
}

// 2FA Verification Result Interface
export interface TwoFactorVerificationResult {
	success: boolean;
	method?: 'totp' | 'backup';
	message: string;
	backupCodeUsed?: boolean;
}
