/**
 * @file src/auth/totp.ts
 * @description Time-based One-Time Password (TOTP) implementation for 2FA
 *
 * This module provides a complete TOTP implementation without external dependencies,
 * using only Node.js built-in crypto module. It follows RFC 6238 standard.
 *
 * Features:
 * - Generate TOTP secrets
 * - Generate QR code URLs for authenticator apps
 * - Verify TOTP codes with time window tolerance
 * - Support for standard 6-digit codes
 * - Multi-tenant aware (secrets are per-user)
 */

import crypto from 'crypto';
import { logger } from '@utils/logger.svelte';

// TOTP Configuration
const TOTP_CONFIG = {
	PERIOD: 30, // Time step in seconds (standard is 30 seconds)
	DIGITS: 6, // Number of digits in the TOTP code (standard is 6)
	ALGORITHM: 'sha1', // HMAC algorithm (standard is SHA1 for TOTP)
	WINDOW: 1, // Allow 1 time step before/after current time (±30 seconds tolerance)
	SECRET_LENGTH: 32 // Length of the base32 secret in bytes
} as const;

// Base32 encoding/decoding (needed for TOTP secrets)
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// Encode binary data to base32
function base32Encode(buffer: Buffer): string {
	let result = '';
	let bits = 0;
	let value = 0;

	for (let i = 0; i < buffer.length; i++) {
		value = (value << 8) | buffer[i];
		bits += 8;

		while (bits >= 5) {
			result += BASE32_CHARS[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}

	if (bits > 0) {
		result += BASE32_CHARS[(value << (5 - bits)) & 31];
	}

	// Add padding
	while (result.length % 8 !== 0) {
		result += '=';
	}

	return result;
}

//Decode base32 string to binary data
function base32Decode(encoded: string): Buffer {
	// Remove padding and convert to uppercase
	encoded = encoded.replace(/=/g, '').toUpperCase();

	let bits = 0;
	let value = 0;
	const result: number[] = [];

	for (let i = 0; i < encoded.length; i++) {
		const char = encoded[i];
		const index = BASE32_CHARS.indexOf(char);

		if (index === -1) {
			throw new Error(`Invalid base32 character: ${char}`);
		}

		value = (value << 5) | index;
		bits += 5;

		if (bits >= 8) {
			result.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}

	return Buffer.from(result);
}

// Generate a random TOTP secret
export function generateTOTPSecret(): string {
	const buffer = crypto.randomBytes(TOTP_CONFIG.SECRET_LENGTH);
	return base32Encode(buffer);
}

// Generate TOTP code for a given secret and time
function generateTOTPCode(secret: string, timeStep: number): string {
	try {
		// Decode the base32 secret
		const keyBuffer = base32Decode(secret);

		// Create time-based counter (8 bytes, big-endian)
		const counter = Buffer.alloc(8);
		counter.writeUInt32BE(Math.floor(timeStep / TOTP_CONFIG.PERIOD), 4);

		// Generate HMAC
		const hmac = crypto.createHmac(TOTP_CONFIG.ALGORITHM, keyBuffer);
		hmac.update(counter);
		const digest = hmac.digest();

		// Dynamic truncation (RFC 4226)
		const offset = digest[digest.length - 1] & 0x0f;
		const code =
			((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);

		// Generate the final TOTP code
		const totp = (code % Math.pow(10, TOTP_CONFIG.DIGITS)).toString();
		return totp.padStart(TOTP_CONFIG.DIGITS, '0');
	} catch (error) {
		logger.error('Error generating TOTP code', { error: error instanceof Error ? error.message : String(error) });
		throw new Error('Failed to generate TOTP code');
	}
}

// Get current TOTP code for a secret
export function getCurrentTOTPCode(secret: string): string {
	const now = Math.floor(Date.now() / 1000);
	return generateTOTPCode(secret, now);
}

// Verify a TOTP code against a secret with time window tolerance
export function verifyTOTPCode(secret: string, userCode: string): boolean {
	if (!secret || !userCode) {
		return false;
	}

	// Normalize user input (remove spaces, ensure 6 digits)
	const cleanCode = userCode.replace(/\s/g, '');
	if (cleanCode.length !== TOTP_CONFIG.DIGITS || !/^\d+$/.test(cleanCode)) {
		return false;
	}

	const now = Math.floor(Date.now() / 1000);

	// Check current time step and adjacent time steps for tolerance
	for (let i = -TOTP_CONFIG.WINDOW; i <= TOTP_CONFIG.WINDOW; i++) {
		const timeStep = now + i * TOTP_CONFIG.PERIOD;
		const expectedCode = generateTOTPCode(secret, timeStep);

		if (cleanCode === expectedCode) {
			logger.debug('TOTP verification successful', { timeOffset: i * TOTP_CONFIG.PERIOD });
			return true;
		}
	}

	logger.debug('TOTP verification failed', { providedCode: cleanCode.replace(/./g, '*') });
	return false;
}

// Generate QR code URL for Google Authenticator and similar apps
export function generateQRCodeURL(secret: string, userEmail: string, serviceName: string = 'SveltyCMS'): string {
	const issuer = encodeURIComponent(serviceName);
	const label = encodeURIComponent(`${serviceName}:${userEmail}`);
	const secretParam = encodeURIComponent(secret);

	// Create the otpauth URL format that authenticator apps understand
	const otpauthURL = `otpauth://totp/${label}?secret=${secretParam}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

	// Generate QR code URL using Google Charts API (doesn't require API key for basic QR codes)
	const qrCodeURL = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(otpauthURL)}`;

	return qrCodeURL;
}

// Generate manual entry details for authenticator apps that don't support QR codes
export function generateManualEntryDetails(
	secret: string,
	userEmail: string,
	serviceName: string = 'SveltyCMS'
): {
	secret: string;
	account: string;
	issuer: string;
	algorithm: string;
	digits: number;
	period: number;
} {
	return {
		secret: secret,
		account: userEmail,
		issuer: serviceName,
		algorithm: 'SHA1',
		digits: TOTP_CONFIG.DIGITS,
		period: TOTP_CONFIG.PERIOD
	};
}

// Validate TOTP secret format
export function isValidTOTPSecret(secret: string): boolean {
	if (!secret || typeof secret !== 'string') {
		return false;
	}

	// Check if it's valid base32
	try {
		base32Decode(secret);
		return true;
	} catch {
		return false;
	}
}

// Generate backup codes for 2FA recovery (one-time use codes)
export function generateBackupCodes(count: number = 10): string[] {
	const codes: string[] = [];

	for (let i = 0; i < count; i++) {
		// Generate 8-character alphanumeric code
		const code = crypto.randomBytes(4).toString('hex').toUpperCase();
		codes.push(code);
	}

	return codes;
}

// Hash backup code for secure storage
export function hashBackupCode(code: string): string {
	return crypto.createHash('sha256').update(code.toLowerCase()).digest('hex');
}

// Verify backup code against hash
export function verifyBackupCode(code: string, hash: string): boolean {
	const codeHash = hashBackupCode(code);
	return crypto.timingSafeEqual(Buffer.from(codeHash), Buffer.from(hash));
}

// Export configuration for testing/debugging
export const TOTP_CONFIG_EXPORT = TOTP_CONFIG;
