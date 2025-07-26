/**
 * @file src/auth/twoFactorAuth.ts
 * @description Two-Factor Authentication service layer
 *
 * This module provides high-level 2FA operations that integrate with the auth system.
 * It handles user 2FA setup, verification, backup codes, and recovery.
 *
 * Features:
 * - Setup and enable 2FA for users
 * - Verify 2FA codes during login
 * - Generate and manage backup codes
 * - Disable 2FA with proper verification
 * - Multi-tenant aware operations
 */

import { logger } from '@utils/logger.svelte';
import {
	generateTOTPSecret,
	generateQRCodeURL,
	generateManualEntryDetails,
	verifyTOTPCode,
	generateBackupCodes,
	hashBackupCode,
	verifyBackupCode,
	isValidTOTPSecret
} from './totp';
import type { User } from './types';
import type { authDBInterface } from './authDBInterface';

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

// Two-Factor Authentication Service
export class TwoFactorAuthService {
	private db: authDBInterface;
	private serviceName: string;

	constructor(db: authDBInterface, serviceName: string = 'SveltyCMS') {
		this.db = db;
		this.serviceName = serviceName;
	}

	/**
	 * Initialize 2FA setup for a user
	 * This generates a new secret and backup codes but doesn't enable 2FA yet
	 */
	async initiate2FASetup(userId: string, userEmail: string, tenantId?: string): Promise<TwoFactorSetupResponse> {
		try {
			logger.info('Initiating 2FA setup', { userId, tenantId });

			// Generate new TOTP secret
			const secret = generateTOTPSecret();

			// Generate QR code URL for authenticator apps
			const qrCodeURL = generateQRCodeURL(secret, userEmail, this.serviceName);

			// Generate manual entry details for apps that don't support QR codes
			const manualEntryDetails = generateManualEntryDetails(secret, userEmail, this.serviceName);

			// Generate backup codes
			const backupCodes = generateBackupCodes(10);

			// Return setup information (don't save to DB yet)
			const response: TwoFactorSetupResponse = {
				secret,
				qrCodeURL,
				manualEntryDetails,
				backupCodes: [...backupCodes] // Return plain codes to user
			};

			logger.info('2FA setup initiated successfully', { userId, tenantId });
			return response;
		} catch (error) {
			const message = `Failed to initiate 2FA setup: ${error instanceof Error ? error.message : String(error)}`;
			logger.error(message, { userId, tenantId });
			throw new Error(message);
		}
	}

	/**
	 * Complete 2FA setup by verifying the first TOTP code
	 * This enables 2FA for the user and saves the secret and backup codes
	 */
	async complete2FASetup(userId: string, secret: string, verificationCode: string, backupCodes: string[], tenantId?: string): Promise<boolean> {
		try {
			logger.info('Completing 2FA setup', { userId, tenantId });

			// Validate the secret
			if (!isValidTOTPSecret(secret)) {
				throw new Error('Invalid TOTP secret format');
			}

			// Verify the TOTP code
			if (!verifyTOTPCode(secret, verificationCode)) {
				logger.warn('2FA setup failed - invalid verification code', { userId, tenantId });
				return false;
			}

			// Hash backup codes for secure storage
			const hashedBackupCodes = backupCodes.map((code) => hashBackupCode(code));

			// Update user with 2FA settings
			const updateData: Partial<User> = {
				is2FAEnabled: true,
				totpSecret: secret,
				backupCodes: hashedBackupCodes,
				last2FAVerification: new Date()
			};

			const result = await this.db.updateUserAttributes(userId, updateData, tenantId);

			if (!result.success) {
				throw new Error('Failed to update user 2FA settings');
			}

			logger.info('2FA setup completed successfully', { userId, tenantId });
			return true;
		} catch (error) {
			const message = `Failed to complete 2FA setup: ${error instanceof Error ? error.message : String(error)}`;
			logger.error(message, { userId, tenantId });
			throw new Error(message);
		}
	}

	/**
	 * Verify 2FA code during authentication
	 * Supports both TOTP codes and backup codes
	 */
	async verify2FA(userId: string, code: string, tenantId?: string): Promise<TwoFactorVerificationResult> {
		try {
			logger.debug('Verifying 2FA code', { userId, tenantId });

			// Get user data
			const userResult = await this.db.getUserById(userId, tenantId);
			if (!userResult.success || !userResult.data) {
				return {
					success: false,
					message: 'User not found'
				};
			}

			const user = userResult.data;

			// Check if 2FA is enabled
			if (!user.is2FAEnabled) {
				return {
					success: false,
					message: '2FA is not enabled for this user'
				};
			}

			// First try TOTP verification
			if (user.totpSecret && verifyTOTPCode(user.totpSecret, code)) {
				// Update last verification time
				await this.db.updateUserAttributes(
					userId,
					{
						last2FAVerification: new Date()
					},
					tenantId
				);

				logger.info('2FA verification successful via TOTP', { userId, tenantId });
				return {
					success: true,
					method: 'totp',
					message: '2FA verification successful'
				};
			}

			// Try backup code verification
			if (user.backupCodes && user.backupCodes.length > 0) {
				for (let i = 0; i < user.backupCodes.length; i++) {
					const hashedCode = user.backupCodes[i];
					if (verifyBackupCode(code, hashedCode)) {
						// Remove used backup code
						const updatedBackupCodes = [...user.backupCodes];
						updatedBackupCodes.splice(i, 1);

						// Update user with remaining backup codes
						await this.db.updateUserAttributes(
							userId,
							{
								backupCodes: updatedBackupCodes,
								last2FAVerification: new Date()
							},
							tenantId
						);

						logger.info('2FA verification successful via backup code', {
							userId,
							tenantId,
							remainingBackupCodes: updatedBackupCodes.length
						});

						return {
							success: true,
							method: 'backup',
							message: `2FA verification successful using backup code. ${updatedBackupCodes.length} backup codes remaining.`,
							backupCodeUsed: true
						};
					}
				}
			}

			logger.warn('2FA verification failed', { userId, tenantId });
			return {
				success: false,
				message: 'Invalid 2FA code'
			};
		} catch (error) {
			const message = `2FA verification error: ${error instanceof Error ? error.message : String(error)}`;
			logger.error(message, { userId, tenantId });
			return {
				success: false,
				message: '2FA verification failed due to system error'
			};
		}
	}

	// Disable 2FA for a user (requires current password or admin permission)
	async disable2FA(userId: string, tenantId?: string): Promise<boolean> {
		try {
			logger.info('Disabling 2FA', { userId, tenantId });

			// Update user to disable 2FA and clear secrets
			const updateData: Partial<User> = {
				is2FAEnabled: false,
				totpSecret: undefined,
				backupCodes: undefined,
				last2FAVerification: undefined
			};

			const result = await this.db.updateUserAttributes(userId, updateData, tenantId);

			if (!result.success) {
				throw new Error('Failed to disable 2FA');
			}

			logger.info('2FA disabled successfully', { userId, tenantId });
			return true;
		} catch (error) {
			const message = `Failed to disable 2FA: ${error instanceof Error ? error.message : String(error)}`;
			logger.error(message, { userId, tenantId });
			throw new Error(message);
		}
	}

	// Generate new backup codes for a user (invalidates old ones)
	async regenerateBackupCodes(userId: string, tenantId?: string): Promise<string[]> {
		try {
			logger.info('Regenerating backup codes', { userId, tenantId });

			// Get user to verify 2FA is enabled
			const userResult = await this.db.getUserById(userId, tenantId);
			if (!userResult.success || !userResult.data || !userResult.data.is2FAEnabled) {
				throw new Error('2FA is not enabled for this user');
			}

			// Generate new backup codes
			const newBackupCodes = generateBackupCodes(10);
			const hashedBackupCodes = newBackupCodes.map((code) => hashBackupCode(code));

			// Update user with new backup codes
			const result = await this.db.updateUserAttributes(
				userId,
				{
					backupCodes: hashedBackupCodes
				},
				tenantId
			);

			if (!result.success) {
				throw new Error('Failed to update backup codes');
			}

			logger.info('Backup codes regenerated successfully', { userId, tenantId });
			return newBackupCodes; // Return plain codes to user
		} catch (error) {
			const message = `Failed to regenerate backup codes: ${error instanceof Error ? error.message : String(error)}`;
			logger.error(message, { userId, tenantId });
			throw new Error(message);
		}
	}

	//Get 2FA status for a user
	async get2FAStatus(
		userId: string,
		tenantId?: string
	): Promise<{
		enabled: boolean;
		hasBackupCodes: boolean;
		backupCodesCount: number;
		lastVerification?: Date;
	}> {
		try {
			const userResult = await this.db.getUserById(userId, tenantId);
			if (!userResult.success || !userResult.data) {
				throw new Error('User not found');
			}

			const user = userResult.data;

			return {
				enabled: user.is2FAEnabled || false,
				hasBackupCodes: Boolean(user.backupCodes && user.backupCodes.length > 0),
				backupCodesCount: user.backupCodes ? user.backupCodes.length : 0,
				lastVerification: user.last2FAVerification
			};
		} catch (error) {
			const message = `Failed to get 2FA status: ${error instanceof Error ? error.message : String(error)}`;
			logger.error(message, { userId, tenantId });
			throw new Error(message);
		}
	}
}

// Create a singleton instance for the default auth database
let defaultTwoFactorService: TwoFactorAuthService | null = null;

export function createTwoFactorAuthService(db: authDBInterface, serviceName?: string): TwoFactorAuthService {
	return new TwoFactorAuthService(db, serviceName);
}

export function getDefaultTwoFactorAuthService(db: authDBInterface): TwoFactorAuthService {
	if (!defaultTwoFactorService) {
		defaultTwoFactorService = new TwoFactorAuthService(db);
	}
	return defaultTwoFactorService;
}
