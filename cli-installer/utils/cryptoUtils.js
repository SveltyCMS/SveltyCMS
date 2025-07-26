/**
 * @file cli-installer/utils/cryptoUtils.js
 * @description Shared cryptographic utilities for CLI installer
 */

import crypto from 'crypto';

// Generate a random JWT secret key of specified length
export function generateRandomJWTSecret(length = 32) {
	// Generate 32 bytes, which results in a 64-character hex string
	return crypto.randomBytes(length).toString('hex');
}

// Generate a random 2FA secret key (base32 encoded for compatibility with authenticator apps)
export function generateRandom2FASecret(length = 32) {
	const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // Base32 charset
	let result = '';
	for (let i = 0; i < length; i++) {
		result += charset.charAt(Math.floor(Math.random() * charset.length));
	}
	return result;
}
