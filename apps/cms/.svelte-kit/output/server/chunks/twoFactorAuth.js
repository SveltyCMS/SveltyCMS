import { logger } from './logger.js';
let crypto;
async function getCrypto() {
	if (!crypto) {
		crypto = await import('node:crypto');
	}
	return crypto;
}
const TOTP_CONFIG = {
	SECRET_LENGTH: 20,
	WINDOW: 1,
	STEP: 30,
	DIGITS: 6,
	ALGORITHM: 'sha1'
};
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buffer) {
	let bits = 0;
	let value = 0;
	let output = '';
	for (let i = 0; i < buffer.length; i++) {
		value = (value << 8) | buffer[i];
		bits += 8;
		while (bits >= 5) {
			output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) {
		output += BASE32_CHARS[(value << (5 - bits)) & 31];
	}
	while (output.length % 8 !== 0) {
		output += '=';
	}
	return output;
}
function base32Decode(encoded) {
	encoded = encoded.replace(/=+$/, '').toUpperCase();
	let bits = 0;
	let value = 0;
	let index = 0;
	const output = Buffer.alloc(Math.ceil((encoded.length * 5) / 8));
	for (let i = 0; i < encoded.length; i++) {
		const char = encoded[i];
		const charValue = BASE32_CHARS.indexOf(char);
		if (charValue === -1) {
			throw new Error(`Invalid base32 character: ${char}`);
		}
		value = (value << 5) | charValue;
		bits += 5;
		if (bits >= 8) {
			output[index++] = (value >>> (bits - 8)) & 255;
			bits -= 8;
		}
	}
	return output.subarray(0, index);
}
async function generateTOTPSecret() {
	const cryptoModule = await getCrypto();
	const buffer = cryptoModule.randomBytes(TOTP_CONFIG.SECRET_LENGTH);
	return base32Encode(buffer);
}
function generateQRCodeURL(secret, userEmail, serviceName) {
	const label = encodeURIComponent(`${serviceName}:${userEmail}`);
	const issuer = encodeURIComponent(serviceName);
	return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
}
function generateManualEntryDetails(secret, userEmail, serviceName) {
	return {
		account: userEmail,
		secret,
		issuer: serviceName,
		algorithm: TOTP_CONFIG.ALGORITHM,
		digits: TOTP_CONFIG.DIGITS,
		period: TOTP_CONFIG.STEP
	};
}
async function verifyTOTPCode(secret, userCode) {
	if (!userCode || userCode.length !== TOTP_CONFIG.DIGITS) {
		return false;
	}
	const cryptoModule = await getCrypto();
	const now = Math.floor(Date.now() / 1e3);
	for (let i = -1; i <= TOTP_CONFIG.WINDOW; i++) {
		const counter = Math.floor(now / TOTP_CONFIG.STEP) + i;
		const keyBuffer = base32Decode(secret);
		const counterBuffer = Buffer.alloc(8);
		counterBuffer.writeUInt32BE(Math.floor(counter / 4294967296), 0);
		counterBuffer.writeUInt32BE(counter & 4294967295, 4);
		const hmac = cryptoModule.createHmac(TOTP_CONFIG.ALGORITHM, keyBuffer);
		hmac.update(counterBuffer);
		const digest = hmac.digest();
		const offset = digest[digest.length - 1] & 15;
		const truncated =
			((digest[offset] & 127) << 24) | ((digest[offset + 1] & 255) << 16) | ((digest[offset + 2] & 255) << 8) | (digest[offset + 3] & 255);
		const code = (truncated % Math.pow(10, TOTP_CONFIG.DIGITS)).toString().padStart(TOTP_CONFIG.DIGITS, '0');
		if (code === userCode) {
			return true;
		}
	}
	return false;
}
async function generateBackupCodes(count = 10) {
	const cryptoModule = await getCrypto();
	const codes = [];
	for (let i = 0; i < count; i++) {
		const code = cryptoModule.randomBytes(4).toString('hex').toUpperCase();
		codes.push(code);
	}
	return codes;
}
async function hashBackupCode(code) {
	const cryptoModule = await getCrypto();
	return cryptoModule.createHash('sha256').update(code.toLowerCase()).digest('hex');
}
async function verifyBackupCode(code, hashedCode) {
	const cryptoModule = await getCrypto();
	const hash = cryptoModule.createHash('sha256').update(code.toLowerCase()).digest('hex');
	return cryptoModule.timingSafeEqual(Buffer.from(hash), Buffer.from(hashedCode));
}
function isValidTOTPSecret(secret) {
	const base32Regex = /^[A-Z2-7]+=*$/;
	return typeof secret === 'string' && secret.length >= 16 && base32Regex.test(secret);
}
class TwoFactorAuthService {
	db;
	serviceName;
	constructor(db, serviceName = 'SveltyCMS') {
		this.db = db;
		this.serviceName = serviceName;
	}
	/**
	 * Initialize 2FA setup for a user
	 * This generates a new secret and backup codes but doesn't enable 2FA yet
	 */
	async initiate2FASetup(userId, userEmail, tenantId) {
		try {
			logger.info('Initiating 2FA setup', { userId, tenantId });
			const secret = await generateTOTPSecret();
			const qrCodeURL = generateQRCodeURL(secret, userEmail, this.serviceName);
			const manualEntryDetails = generateManualEntryDetails(secret, userEmail, this.serviceName);
			const backupCodes = await generateBackupCodes(10);
			const response = {
				secret,
				qrCodeURL,
				manualEntryDetails,
				backupCodes: [...backupCodes]
				// Return plain codes to user
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
	async complete2FASetup(userId, secret, verificationCode, backupCodes, tenantId) {
		try {
			logger.info('Completing 2FA setup', { userId, tenantId });
			if (!isValidTOTPSecret(secret)) {
				throw new Error('Invalid TOTP secret format');
			}
			if (!(await verifyTOTPCode(secret, verificationCode))) {
				logger.warn('2FA setup failed - invalid verification code', { userId, tenantId });
				return false;
			}
			const hashedBackupCodes = await Promise.all(backupCodes.map((code) => hashBackupCode(code)));
			const updateData = {
				is2FAEnabled: true,
				totpSecret: secret,
				backupCodes: hashedBackupCodes,
				last2FAVerification: /* @__PURE__ */ new Date().toISOString()
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
	async verify2FA(userId, code, tenantId) {
		try {
			logger.debug('Verifying 2FA code', { userId, tenantId });
			const userResult = await this.db.getUserById(userId, tenantId);
			if (!userResult.success || !userResult.data) {
				return {
					success: false,
					message: 'User not found'
				};
			}
			const user = userResult.data;
			if (!user.is2FAEnabled) {
				return {
					success: false,
					message: '2FA is not enabled for this user'
				};
			}
			if (user.totpSecret && (await verifyTOTPCode(user.totpSecret, code))) {
				await this.db.updateUserAttributes(
					userId,
					{
						last2FAVerification: /* @__PURE__ */ new Date().toISOString()
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
			if (user.backupCodes && user.backupCodes.length > 0) {
				for (let i = 0; i < user.backupCodes.length; i++) {
					const hashedCode = user.backupCodes[i];
					if (await verifyBackupCode(code, hashedCode)) {
						const updatedBackupCodes = [...user.backupCodes];
						updatedBackupCodes.splice(i, 1);
						await this.db.updateUserAttributes(
							userId,
							{
								backupCodes: updatedBackupCodes,
								last2FAVerification: /* @__PURE__ */ new Date().toISOString()
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
	async disable2FA(userId, tenantId) {
		try {
			logger.info('Disabling 2FA', { userId, tenantId });
			const updateData = {
				is2FAEnabled: false,
				totpSecret: void 0,
				backupCodes: void 0,
				last2FAVerification: void 0
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
	async regenerateBackupCodes(userId, tenantId) {
		try {
			logger.info('Regenerating backup codes', { userId, tenantId });
			const userResult = await this.db.getUserById(userId, tenantId);
			if (!userResult.success || !userResult.data || !userResult.data.is2FAEnabled) {
				throw new Error('2FA is not enabled for this user');
			}
			const newBackupCodes = await generateBackupCodes(10);
			const hashedBackupCodes = await Promise.all(newBackupCodes.map((code) => hashBackupCode(code)));
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
			return newBackupCodes;
		} catch (error) {
			const message = `Failed to regenerate backup codes: ${error instanceof Error ? error.message : String(error)}`;
			logger.error(message, { userId, tenantId });
			throw new Error(message);
		}
	}
	//Get 2FA status for a user
	async get2FAStatus(userId, tenantId) {
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
let defaultTwoFactorService = null;
function getDefaultTwoFactorAuthService(db) {
	if (!defaultTwoFactorService) {
		defaultTwoFactorService = new TwoFactorAuthService(db);
	}
	return defaultTwoFactorService;
}
export { TwoFactorAuthService, getDefaultTwoFactorAuthService };
//# sourceMappingURL=twoFactorAuth.js.map
