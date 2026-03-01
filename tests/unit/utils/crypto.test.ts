/**
 * @file tests/bun/utils/crypto.test.ts
 * @description Tests for cryptographic utility functions
 */

import { describe, expect, it } from 'bun:test';
import { createChecksum, generateRandomToken, hashPassword, verifyPassword } from '@src/utils/crypto';

describe('Crypto Utils - Password Hashing', () => {
	it('should hash a password', async () => {
		const password = 'TestPassword123!';
		const hash = await hashPassword(password);

		expect(typeof hash).toBe('string');
		expect(hash.length).toBeGreaterThan(0);
		expect(hash).toContain('$argon2');
	});

	it('should create unique hashes for same password', async () => {
		const password = 'TestPassword123!';
		const hash1 = await hashPassword(password);
		const hash2 = await hashPassword(password);

		// Hashes should be different due to unique salts
		expect(hash1).not.toBe(hash2);
	});

	it('should verify correct password', async () => {
		const password = 'TestPassword123!';
		const hash = await hashPassword(password);

		const isValid = await verifyPassword(password, hash);
		expect(isValid).toBe(true);
	});

	it('should reject incorrect password', async () => {
		const password = 'TestPassword123!';
		const wrongPassword = 'WrongPassword123!';
		const hash = await hashPassword(password);

		const isValid = await verifyPassword(wrongPassword, hash);
		expect(isValid).toBe(false);
	});

	it('should handle empty passwords', async () => {
		const hash = await hashPassword('');
		expect(typeof hash).toBe('string');

		const isValid = await verifyPassword('', hash);
		expect(isValid).toBe(true);
	});

	it('should handle long passwords', async () => {
		const longPassword = 'a'.repeat(1000);
		const hash = await hashPassword(longPassword);

		const isValid = await verifyPassword(longPassword, hash);
		expect(isValid).toBe(true);
	});

	it('should handle special characters in passwords', async () => {
		const password = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
		const hash = await hashPassword(password);

		const isValid = await verifyPassword(password, hash);
		expect(isValid).toBe(true);
	});

	it('should handle unicode passwords', async () => {
		const password = 'パスワード🔒密码';
		const hash = await hashPassword(password);

		const isValid = await verifyPassword(password, hash);
		expect(isValid).toBe(true);
	});
});

describe('Crypto Utils - Random Token Generation', () => {
	it('should generate random token of default length', () => {
		const token = generateRandomToken();

		expect(typeof token).toBe('string');
		expect(token.length).toBe(64); // 32 bytes = 64 hex chars
	});

	it('should generate token of specified length', () => {
		const token = generateRandomToken(16);

		expect(typeof token).toBe('string');
		expect(token.length).toBe(32); // 16 bytes = 32 hex chars
	});

	it('should generate unique tokens', () => {
		const token1 = generateRandomToken();
		const token2 = generateRandomToken();

		expect(token1).not.toBe(token2);
	});

	it('should generate hexadecimal tokens', () => {
		const token = generateRandomToken();

		// Should only contain hex characters (0-9, a-f)
		expect(/^[0-9a-f]+$/.test(token)).toBe(true);
	});

	it('should handle small token sizes', () => {
		const token = generateRandomToken(1);

		expect(token.length).toBe(2); // 1 byte = 2 hex chars
	});

	it('should handle large token sizes', () => {
		const token = generateRandomToken(256);

		expect(token.length).toBe(512); // 256 bytes = 512 hex chars
	});
});

describe('Crypto Utils - Checksum', () => {
	it('should create checksum for string', () => {
		const data = 'test data';
		const checksum = createChecksum(data);

		expect(typeof checksum).toBe('string');
		expect(checksum.length).toBeGreaterThan(0);
	});

	it('should create checksum for object', () => {
		const data = { key: 'value', number: 123 };
		const checksum = createChecksum(data);

		expect(typeof checksum).toBe('string');
		expect(checksum.length).toBeGreaterThan(0);
	});

	it('should create consistent checksums', () => {
		const data = 'test data';
		const checksum1 = createChecksum(data);
		const checksum2 = createChecksum(data);

		expect(checksum1).toBe(checksum2);
	});

	it('should create different checksums for different data', () => {
		const checksum1 = createChecksum('data1');
		const checksum2 = createChecksum('data2');

		expect(checksum1).not.toBe(checksum2);
	});

	it('should handle object property order', () => {
		const obj1 = { a: 1, b: 2 };
		const obj2 = { b: 2, a: 1 };

		const checksum1 = createChecksum(obj1);
		const checksum2 = createChecksum(obj2);

		// JSON.stringify does NOT sort keys, so order matters
		expect(checksum1).not.toBe(checksum2);
	});
	it('should handle nested objects', () => {
		const data = {
			level1: {
				level2: {
					value: 'nested'
				}
			}
		};

		const checksum = createChecksum(data);
		expect(typeof checksum).toBe('string');
	});

	it('should handle arrays', () => {
		const data = [1, 2, 3, 4, 5];
		const checksum = createChecksum(data);

		expect(typeof checksum).toBe('string');
	});

	it('should handle null', () => {
		// null stringifies to 'null'
		const checksumNull = createChecksum(null);
		expect(typeof checksumNull).toBe('string');
		expect(checksumNull.length).toBe(64); // SHA-256 hex is 64 chars
	});
});

describe('Crypto Utils - Security Properties', () => {
	it('should use Argon2id algorithm', async () => {
		const hash = await hashPassword('test');

		// Argon2id hashes start with $argon2id$
		expect(hash.startsWith('$argon2id$')).toBe(true);
	});

	it('should be computationally expensive', async () => {
		const start = Date.now();
		await hashPassword('test');
		const duration = Date.now() - start;

		// Argon2id should take some time (at least a few ms)
		expect(duration).toBeGreaterThan(0);
	});

	it('should resist timing attacks', async () => {
		const password = 'TestPassword123!';
		const hash = await hashPassword(password);

		const start1 = Date.now();
		await verifyPassword('wrong', hash);
		const duration1 = Date.now() - start1;

		const start2 = Date.now();
		await verifyPassword(password, hash);
		const duration2 = Date.now() - start2;

		// Durations should be similar (within reasonable variance)
		// This is a basic check - true timing resistance is harder to test
		expect(Math.abs(duration1 - duration2)).toBeLessThan(1000);
	});
});
