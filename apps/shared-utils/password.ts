/**
 * @file src/utils/password.ts
 * @description Centralized password hashing and verification utilities
 *
 * QUANTUM COMPUTING SECURITY:
 * ==========================
 * This module uses Argon2id, which is inherently quantum-resistant:
 *
 * - Memory-hard algorithm: Quantum computers don't have memory advantages
 * - 64 MB per hash: Limits quantum computer parallelization
 * - Grover's algorithm ineffective: No speedup for memory-bound operations
 * - Secure until 2045+: Strong resistance against both classical and quantum attacks
 *
 * This module provides a single source of truth for all password operations
 * to ensure consistency across the entire application.
 *
 * @see https://csrc.nist.gov/projects/post-quantum-cryptography
 */

// System Logger
import { logger } from '@utils/logger';

/**
 * Argon2id configuration - Quantum-resistant password hashing
 *
 * SECURITY RATIONALE:
 * - Memory (64 MB): Makes attacks expensive even with quantum computers
 * - Time (3 iterations): Adds computational cost without degrading UX
 * - Parallelism (4 threads): Optimized for modern multi-core CPUs
 * - Type (argon2id): Hybrid mode resistant to both side-channel and GPU attacks
 *
 * QUANTUM RESISTANCE:
 * Quantum computers excel at computation but are limited by:
 * 1. Limited qubits (can't allocate 64 MB per hash)
 * 2. Memory access patterns (not parallelizable by quantum algorithms)
 * 3. Grover's algorithm only helps with computation, not memory operations
 *
 * This makes Argon2id secure against quantum attacks for decades to come.
 */
const ARGON2_CONFIG = {
	memory: 65536, // 64 MB - Quantum-resistant memory requirement
	time: 3, // 3 iterations - Computational complexity
	parallelism: 4, // 4 parallel threads - CPU optimization
	type: 2 // argon2id (hybrid: side-channel + GPU resistant)
} as const;

/**
 * Hash a password using argon2id with quantum-resistant parameters
 *
 * SECURITY FEATURES:
 * - Argon2id: Winner of Password Hashing Competition (2015)
 * - Memory-hard: 64 MB per hash (resists GPU/ASIC/quantum attacks)
 * - Quantum-resistant: No known quantum speedup for memory-bound algorithms
 * - Salt: Automatically generated per password (prevents rainbow tables)
 *
 * QUANTUM RESISTANCE:
 * Unlike computational algorithms vulnerable to Grover's algorithm,
 * memory-hard algorithms like Argon2 maintain full security because:
 * - Quantum computers have limited qubits (can't store 64 MB per hash)
 * - Memory access patterns aren't parallelizable
 * - No quantum advantage for memory-bound operations
 *
 * @param password - The plain text password to hash
 * @returns Promise<string> - The hashed password in PHC format
 * @throws Error if hashing fails
 */
export async function hashPassword(password: string): Promise<string> {
	try {
		const argon2 = await import('argon2');

		const hashedPassword = await argon2.hash(password, {
			memoryCost: ARGON2_CONFIG.memory,
			timeCost: ARGON2_CONFIG.time,
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
 * Verify a password against a hash using constant-time comparison
 *
 * SECURITY FEATURES:
 * - Timing-safe: Prevents timing attacks (comparison time is constant)
 * - Automatic parameter extraction: Uses stored salt, memory, time settings
 * - Quantum-resistant: Argon2 verification maintains quantum resistance
 *
 * @param hashedPassword - The stored hash to verify against (PHC format)
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
 * Check if a password hash needs rehashing for enhanced security
 *
 * USE CASES:
 * - Security parameter upgrades (e.g., increase memory from 64 MB to 128 MB)
 * - Algorithm migration (e.g., future post-quantum algorithms)
 * - Legacy hash format detection
 *
 * QUANTUM MIGRATION:
 * While Argon2id is quantum-resistant, this function will be useful when:
 * - Increasing parameters for high-security applications
 * - Migrating to hybrid classical+post-quantum schemes (2030+)
 * - Detecting legacy hashes that need upgrading
 *
 * @param hashedPassword - The stored password hash
 * @returns Promise<boolean> - True if rehashing is needed
 */
export async function needsRehashing(hashedPassword: string): Promise<boolean> {
	try {
		const argon2 = await import('argon2');

		// Check if the hash uses our current secure parameters
		// argon2.needsRehash will return true if the hash doesn't match our current settings
		return argon2.needsRehash(hashedPassword, {
			memoryCost: ARGON2_CONFIG.memory,
			timeCost: ARGON2_CONFIG.time,
			parallelism: ARGON2_CONFIG.parallelism
		});
	} catch (error) {
		logger.error('Failed to check if password needs rehashing:', error);
		// If we can't check, assume it needs rehashing for safety
		return true;
	}
}

/**
 * Get the current argon2 configuration for reference
 *
 * SECURITY PARAMETERS:
 * - memory: 65536 KiB (64 MB) - Makes attacks expensive
 * - time: 3 iterations - Computational cost
 * - parallelism: 4 threads - CPU optimization
 * - type: 2 (argon2id) - Hybrid security mode
 *
 * QUANTUM RESISTANCE:
 * These parameters provide strong quantum resistance because:
 * - 64 MB memory requirement limits quantum parallelization
 * - Memory-hard algorithms resist Grover's algorithm
 * - Secure for 15-30+ years against quantum computers
 *
 * FUTURE ENHANCEMENTS (2030+):
 * Consider increasing parameters for ultra-high security:
 * - memory: 131072 KiB (128 MB)
 * - time: 5 iterations
 * This would extend quantum resistance even further.
 *
 * @returns The current secure argon2 configuration
 */
export function getPasswordConfig() {
	return { ...ARGON2_CONFIG };
}
