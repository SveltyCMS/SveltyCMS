/**
 * @file src/utils/password.ts
 * @description Centralized password hashing and verification utilities
 *
 * This module provides a single source of truth for all password operations
 * to ensure consistency across the entire application.
 */

// System Logger
import { logger } from '@utils/logger';

// Secure argon2 configuration
const ARGON2_CONFIG = {
	memory: 65536, // 64 MB
	time: 3, // 3 iterations
	parallelism: 4, // 4 parallel threads
	type: 2 // argon2id (most secure variant)
} as const;

/**
 * Hash a password using argon2id with secure parameters
 * @param password - The plain text password to hash
 * @returns Promise<string> - The hashed password
 */
export async function hashPassword(password: string): Promise<string> {
	try {
		const argon2 = await import('argon2');

		const hashedPassword = await argon2.hash(password, {
			memory: ARGON2_CONFIG.memory,
			time: ARGON2_CONFIG.time,
			parallelism: ARGON2_CONFIG.parallelism,
			type: argon2.argon2id
		});

		logger.trace('Password hashed successfully');
		return hashedPassword;
	} catch (error) {
		logger.error('Failed to hash password:', error);
		throw new Error('Password hashing failed');
	}
}

/**
 * Verify a password against a hash
 * @param hashedPassword - The stored hash to verify against
 * @param plainPassword - The plain text password to verify
 * @returns Promise<boolean> - True if password matches, false otherwise
 */
export async function verifyPassword(hashedPassword: string, plainPassword: string): Promise<boolean> {
	try {
		const argon2 = await import('argon2');

		const isValid = await argon2.verify(hashedPassword, plainPassword);

		logger.trace('Password verification completed', { isValid });
		return isValid;
	} catch (error) {
		logger.error('Password verification failed:', error);
		return false;
	}
}

/**
 * Check if a password needs rehashing (for future migrations)
 * Currently returns false as we're using the latest secure format
 * @param hashedPassword - The stored password hash
 * @returns Promise<boolean> - True if rehashing is needed
 */
export async function needsRehashing(hashedPassword: string): Promise<boolean> {
	try {
		const argon2 = await import('argon2');

		// Check if the hash uses our current secure parameters
		// argon2.needsRehash will return true if the hash doesn't match our current settings
		return argon2.needsRehash(hashedPassword, {
			memory: ARGON2_CONFIG.memory,
			time: ARGON2_CONFIG.time,
			parallelism: ARGON2_CONFIG.parallelism,
			type: argon2.argon2id
		});
	} catch (error) {
		logger.error('Failed to check if password needs rehashing:', error);
		// If we can't check, assume it needs rehashing for safety
		return true;
	}
}

/**
 * Get the current argon2 configuration (for reference)
 * @returns The current secure argon2 configuration
 */
export function getPasswordConfig() {
	return { ...ARGON2_CONFIG };
}
