import { logger } from './logger.js';
let argon2 = null;
let crypto = null;
if (typeof window === 'undefined') {
	try {
		argon2 = await import('argon2');
		crypto = await import('crypto');
	} catch (error) {
		logger.error('Failed to load cryptographic modules', { error });
	}
}
const argon2Config = {
	// Memory cost in KiB (64 MB) - Makes attacks expensive even with quantum computers
	memory: 65536,
	// Time cost (number of iterations) - Adds computational complexity
	time: 3,
	// Parallelism factor (number of threads) - Optimizes for modern CPUs
	parallelism: 4,
	// Use Argon2id (hybrid version - best for most use cases)
	type: 2,
	// argon2id
	// Output hash length in bytes
	hashLength: 32
};
const encryptionConfig = {
	algorithm: 'aes-256-gcm',
	keyLength: 32,
	// 256 bits (128-bit quantum security)
	ivLength: 16,
	// 128 bits
	saltLength: 32,
	// 256 bits (128-bit quantum security)
	authTagLength: 16
	// 128 bits (provides data integrity)
};
async function hashPassword(password) {
	if (!argon2) {
		throw new Error('Argon2 not available - server-side only');
	}
	return argon2.hash(password, {
		...argon2Config,
		type: argon2.argon2id
	});
}
async function verifyPassword(password, hash) {
	if (!argon2) {
		throw new Error('Argon2 not available - server-side only');
	}
	return argon2.verify(hash, password);
}
async function deriveKey(password, salt) {
	if (!argon2) {
		throw new Error('Argon2 not available - server-side only');
	}
	const hash = await argon2.hash(password, {
		...argon2Config,
		type: argon2.argon2id,
		salt,
		raw: true
	});
	return Buffer.from(hash).subarray(0, encryptionConfig.keyLength);
}
async function encryptData(data, password) {
	if (!crypto || !argon2) {
		throw new Error('Crypto modules not available - server-side only');
	}
	const salt = crypto.randomBytes(encryptionConfig.saltLength);
	const iv = crypto.randomBytes(encryptionConfig.ivLength);
	const key = await deriveKey(password, salt);
	const cipher = crypto.createCipheriv(encryptionConfig.algorithm, key, iv);
	const plaintext = JSON.stringify(data);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	const combined = Buffer.concat([salt, iv, authTag, encrypted]);
	logger.debug('Data encrypted successfully', {
		saltLength: salt.length,
		ivLength: iv.length,
		authTagLength: authTag.length,
		encryptedLength: encrypted.length
	});
	return combined.toString('base64');
}
async function decryptData(encryptedData, password) {
	if (!crypto || !argon2) {
		throw new Error('Crypto modules not available - server-side only');
	}
	try {
		const combined = Buffer.from(encryptedData, 'base64');
		let offset = 0;
		const salt = combined.subarray(offset, offset + encryptionConfig.saltLength);
		offset += encryptionConfig.saltLength;
		const iv = combined.subarray(offset, offset + encryptionConfig.ivLength);
		offset += encryptionConfig.ivLength;
		const authTag = combined.subarray(offset, offset + encryptionConfig.authTagLength);
		offset += encryptionConfig.authTagLength;
		const encrypted = combined.subarray(offset);
		const key = await deriveKey(password, salt);
		const decipher = crypto.createDecipheriv(encryptionConfig.algorithm, key, iv);
		decipher.setAuthTag(authTag);
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
function createChecksum(data) {
	if (!crypto) {
		throw new Error('Crypto not available - server-side only');
	}
	const str = JSON.stringify(data);
	return crypto.createHash('sha256').update(str).digest('hex');
}
export { createChecksum as c, decryptData as d, encryptData as e, hashPassword as h, verifyPassword as v };
//# sourceMappingURL=crypto.js.map
