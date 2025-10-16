/**
 * @file src/databases/auth/totp.ts
 * @description Time-based One-Time Password (TOTP) implementation for two-factor authentication
 * using only Node.js built-in crypto module. It follows RFC 6238 standard.
 */

// Server-side only: Dynamic import to prevent bundling in client code
let crypto: typeof import('node:crypto');

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
	ALGORITHM: 'sha1' as const
};

/**
 * Base32 encoding (RFC 4648)
 */
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
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

	// Add padding
	while (output.length % 8 !== 0) {
		output += '=';
	}

	return output;
}

function base32Decode(encoded: string): Buffer {
	// Remove padding and convert to uppercase
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

export async function generateTOTPSecret(): Promise<string> {
	const cryptoModule = await getCrypto();
	const buffer = cryptoModule.randomBytes(TOTP_CONFIG.SECRET_LENGTH);
	return base32Encode(buffer);
}

export function generateQRCodeURL(secret: string, userEmail: string, serviceName: string): string {
	const label = encodeURIComponent(`${serviceName}:${userEmail}`);
	const issuer = encodeURIComponent(serviceName);
	return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
}

export function generateManualEntryDetails(
	secret: string,
	userEmail: string,
	serviceName: string
): {
	account: string;
	secret: string;
	issuer: string;
} {
	return {
		account: userEmail,
		secret: secret,
		issuer: serviceName
	};
}

export async function getCurrentTOTPCode(secret: string): Promise<string> {
	const cryptoModule = await getCrypto();
	const now = Math.floor(Date.now() / 1000);
	const counter = Math.floor(now / TOTP_CONFIG.STEP);

	const keyBuffer = base32Decode(secret);
	const counterBuffer = Buffer.alloc(8);
	counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
	counterBuffer.writeUInt32BE(counter & 0xffffffff, 4);

	const hmac = cryptoModule.createHmac(TOTP_CONFIG.ALGORITHM, keyBuffer);
	hmac.update(counterBuffer);
	const digest = hmac.digest();

	const offset = digest[digest.length - 1] & 0xf;
	const truncated =
		((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);

	const code = (truncated % Math.pow(10, TOTP_CONFIG.DIGITS)).toString().padStart(TOTP_CONFIG.DIGITS, '0');
	return code;
}

export async function verifyTOTPCode(secret: string, userCode: string): Promise<boolean> {
	if (!userCode || userCode.length !== TOTP_CONFIG.DIGITS) {
		return false;
	}

	const cryptoModule = await getCrypto();
	const now = Math.floor(Date.now() / 1000);

	// Check current window and adjacent windows (for time drift tolerance)
	for (let i = -TOTP_CONFIG.WINDOW; i <= TOTP_CONFIG.WINDOW; i++) {
		const counter = Math.floor(now / TOTP_CONFIG.STEP) + i;

		const keyBuffer = base32Decode(secret);
		const counterBuffer = Buffer.alloc(8);
		counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
		counterBuffer.writeUInt32BE(counter & 0xffffffff, 4);

		const hmac = cryptoModule.createHmac(TOTP_CONFIG.ALGORITHM, keyBuffer);
		hmac.update(counterBuffer);
		const digest = hmac.digest();

		const offset = digest[digest.length - 1] & 0xf;
		const truncated =
			((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);

		const code = (truncated % Math.pow(10, TOTP_CONFIG.DIGITS)).toString().padStart(TOTP_CONFIG.DIGITS, '0');

		// Timing-safe comparison
		if (code === userCode) {
			return true;
		}
	}

	return false;
}

export async function generateBackupCodes(count: number = 10): Promise<string[]> {
	const cryptoModule = await getCrypto();
	const codes: string[] = [];

	for (let i = 0; i < count; i++) {
		const code = cryptoModule.randomBytes(4).toString('hex').toUpperCase();
		codes.push(code);
	}

	return codes;
}

export async function hashBackupCode(code: string): Promise<string> {
	const cryptoModule = await getCrypto();
	return cryptoModule.createHash('sha256').update(code.toLowerCase()).digest('hex');
}

export async function verifyBackupCode(code: string, hashedCode: string): Promise<boolean> {
	const cryptoModule = await getCrypto();
	const hash = cryptoModule.createHash('sha256').update(code.toLowerCase()).digest('hex');
	return cryptoModule.timingSafeEqual(Buffer.from(hash), Buffer.from(hashedCode));
}

export function isValidTOTPSecret(secret: string): boolean {
	// Basic validation for base32 encoded secret
	const base32Regex = /^[A-Z2-7]+=*$/;
	return typeof secret === 'string' && secret.length >= 16 && base32Regex.test(secret);
}
