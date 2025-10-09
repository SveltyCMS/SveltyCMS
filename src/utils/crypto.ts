/**
 * @file src/utils/crypto.ts
 * @description Enterprise-grade cryptography utilities using Argon2 for key derivation
 *
 * This module provides:
 * - Password hashing with Argon2id (winner of Password Hashing Competition)
 * - Key derivation from passwords using Argon2 (better than PBKDF2)
 * - AES-256-GCM encryption/decryption with Argon2-derived keys
 * - Secure random token generation
 * - SHA256 checksum generation for data integrity
 */

import { logger } from '@utils/logger.svelte';

// Import argon2 and crypto (server-side only)
let argon2: typeof import('argon2') | null = null;
let crypto: typeof import('crypto') | null = null;

if (typeof window === 'undefined') {
	try {
		argon2 = await import('argon2');
		crypto = await import('crypto');
	} catch (error) {
		logger.error('Failed to load cryptographic modules', { error });
	}
}

/**
 * Argon2 configuration for enterprise security
 * These settings provide a good balance between security and performance
 */
export const argon2Config = {
	// Memory cost in KiB (64 MB)
	memory: 65536,
	// Time cost (number of iterations)
	time: 3,
	// Parallelism factor (number of threads)
	parallelism: 4,
	// Use Argon2id (hybrid version - best for most use cases)
	type: 2 as const, // argon2id
	// Output hash length in bytes
	hashLength: 32
};

// AES-256-GCM encryption configuration
export const encryptionConfig = {
	algorithm: 'aes-256-gcm' as const,
	keyLength: 32, // 256 bits
	ivLength: 16, // 128 bits
	saltLength: 32, // 256 bits
	authTagLength: 16 // 128 bits
};

/**
 * Hash a password using Argon2id
 *
 * @param password - Plain text password to hash
 * @returns Promise resolving to hashed password
 * @throws Error if argon2 is not available
 */
export async function hashPassword(password: string): Promise<string> {
	if (!argon2) {
		throw new Error('Argon2 not available - server-side only');
	}

	return argon2.hash(password, {
		...argon2Config,
		type: argon2.argon2id
	});
}

/**
 * Verify a password against its hash using Argon2
 *
 * @param password - Plain text password to verify
 * @param hash - Hashed password to compare against
 * @returns Promise resolving to true if password matches
 * @throws Error if argon2 is not available
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	if (!argon2) {
		throw new Error('Argon2 not available - server-side only');
	}

	return argon2.verify(hash, password);
}

/**
 * Derive a cryptographic key from a password using Argon2
 * This is more secure than PBKDF2 for key derivation
 *
 * @param password - Password to derive key from
 * @param salt - Salt for key derivation (should be unique per encryption)
 * @returns Promise resolving to derived key buffer
 * @throws Error if argon2 is not available
 */
export async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
	if (!argon2) {
		throw new Error('Argon2 not available - server-side only');
	}

	// Use Argon2 to derive a raw key (not encoded)
	const hash = await argon2.hash(password, {
		...argon2Config,
		type: argon2.argon2id,
		salt,
		raw: true
	});

	// Ensure key is exactly 32 bytes for AES-256
	return Buffer.from(hash).subarray(0, encryptionConfig.keyLength);
}

/**
 * Encrypt data using AES-256-GCM with Argon2-derived key
 *
 * @param data - Data object to encrypt
 * @param password - Password to derive encryption key from
 * @returns Base64-encoded encrypted data (salt + iv + authTag + ciphertext)
 * @throws Error if crypto modules are not available
 */
export async function encryptData(data: Record<string, unknown>, password: string): Promise<string> {
	if (!crypto || !argon2) {
		throw new Error('Crypto modules not available - server-side only');
	}

	// Generate random salt and IV
	const salt = crypto.randomBytes(encryptionConfig.saltLength);
	const iv = crypto.randomBytes(encryptionConfig.ivLength);

	// Derive key using Argon2 (more secure than PBKDF2)
	const key = await deriveKey(password, salt);

	// Create cipher
	const cipher = crypto.createCipheriv(encryptionConfig.algorithm, key, iv);

	// Encrypt data
	const plaintext = JSON.stringify(data);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

	// Get authentication tag
	const authTag = cipher.getAuthTag();

	// Combine: salt + iv + authTag + encrypted data
	const combined = Buffer.concat([salt, iv, authTag, encrypted]);

	logger.debug('Data encrypted successfully', {
		saltLength: salt.length,
		ivLength: iv.length,
		authTagLength: authTag.length,
		encryptedLength: encrypted.length
	});

	return combined.toString('base64');
}

/**
 * Decrypt data using AES-256-GCM with Argon2-derived key
 *
 * @param encryptedData - Base64-encoded encrypted data
 * @param password - Password to derive decryption key from
 * @returns Decrypted data object
 * @throws Error if decryption fails or password is incorrect
 */
export async function decryptData(encryptedData: string, password: string): Promise<Record<string, unknown>> {
	if (!crypto || !argon2) {
		throw new Error('Crypto modules not available - server-side only');
	}

	try {
		// Decode base64
		const combined = Buffer.from(encryptedData, 'base64');

		// Extract components
		let offset = 0;
		const salt = combined.subarray(offset, offset + encryptionConfig.saltLength);
		offset += encryptionConfig.saltLength;

		const iv = combined.subarray(offset, offset + encryptionConfig.ivLength);
		offset += encryptionConfig.ivLength;

		const authTag = combined.subarray(offset, offset + encryptionConfig.authTagLength);
		offset += encryptionConfig.authTagLength;

		const encrypted = combined.subarray(offset);

		// Derive key using same password and salt
		const key = await deriveKey(password, salt);

		// Create decipher
		const decipher = crypto.createDecipheriv(encryptionConfig.algorithm, key, iv);
		decipher.setAuthTag(authTag);

		// Decrypt data
		const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

		logger.debug('Data decrypted successfully', {
			decryptedLength: decrypted.length
		});

		return JSON.parse(decrypted.toString('utf8'));
	} catch (error) {
		logger.error('Decryption failed', { error });
		throw new Error('Failed to decrypt data. Password may be incorrect or data corrupted.');
	}
}

/**
 * Creates a SHA256 checksum for any given data object.
 * Useful for data integrity checks and detecting changes.
 *
 * @param data - The data to hash (will be stringified).
 * @returns A hex-encoded SHA256 hash.
 * @throws Error if crypto is not available.
 */
export function createChecksum(data: any): string {
	if (!crypto) {
		throw new Error('Crypto not available - server-side only');
	}
	const str = JSON.stringify(data);
	return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Generate a secure random token
 *
 * @param length - Length of token in bytes (default: 32)
 * @returns Hex-encoded random token
 * @throws Error if crypto is not available
 */
export function generateRandomToken(length: number = 32): string {
	if (!crypto) {
		throw new Error('Crypto not available - server-side only');
	}

	return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate a secure random UUID
 *
 * @returns UUID string
 * @throws Error if crypto is not available
 */
export function generateUUID(): string {
	if (!crypto) {
		throw new Error('Crypto not available - server-side only');
	}

	return crypto.randomUUID();
}

/**
 * Check if cryptographic modules are available
 *
 * @returns True if crypto and argon2 are available
 */
export function isCryptoAvailable(): boolean {
	return crypto !== null && argon2 !== null;
}
